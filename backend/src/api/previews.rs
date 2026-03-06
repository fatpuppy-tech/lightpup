//! Preview environments API: create = build + run container; delete/cleanup = stop + remove.

use crate::api::auth::CurrentUser;
use crate::api::permissions::{require_can_mutate_project, require_can_view_project};
use crate::api::deploy::build_image_from_repo;
use crate::api::error::error_response;
use crate::api::types::CreatePreviewRequest;
use crate::AppState;
use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use uuid::Uuid;

const PREVIEW_PORT_START: u16 = 9100;
const PREVIEW_PORT_END: u16 = 65535;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/applications/:id/previews", get(list_previews).post(create_preview))
        .route("/api/applications/:id/previews/:preview_id", delete(delete_preview))
        .route("/api/previews/:id/cleanup", post(cleanup_preview))
}

async fn list_previews(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(app_id): Path<String>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&app_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_view_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.get_previews(&app_id).await {
        Ok(previews) => Json(previews).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_preview(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(app_id): Path<String>,
    Json(payload): Json<CreatePreviewRequest>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&app_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    let id = Uuid::new_v4().to_string();
    let slug = payload
        .branch
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let short_id = id.get(..8).unwrap_or(&id);
    let url = format!("{}-{}.preview.localhost", slug, short_id);
    let expires_at = payload.expires_in_days.map(|days| {
        (chrono::Utc::now() + chrono::Duration::days(days as i64)).to_rfc3339()
    });

    if let Err(e) =
        state.db.create_preview(&id, &app_id, &payload.branch, &url, expires_at.as_deref()).await
    {
        return error_response(&e).into_response();
    }

    let state_clone = state.clone();
    let branch = payload.branch.clone();
    let preview_id_for_task = id.clone();
    tokio::spawn(async move {
        run_preview_build(state_clone, preview_id_for_task, app_id, branch, url).await;
    });

    match state.db.get_preview(&id).await {
        Ok(preview) => Json(preview).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn run_preview_build(
    state: AppState,
    preview_id: String,
    app_id: String,
    branch: String,
    url: String,
) {
    let app = match state.db.get_application(&app_id).await {
        Ok(a) => a,
        Err(e) => {
            tracing::warn!("Preview {}: app not found: {}", preview_id, e);
            let _ = state.db.update_preview_status(&preview_id, "failed").await;
            return;
        }
    };

    if app.build_type != "docker" || app.repo_url.is_none() {
        tracing::warn!("Preview {}: app has no repo or build_type != docker", preview_id);
        let _ = state.db.update_preview_status(&preview_id, "failed").await;
        return;
    }

    let used = state.db.get_used_host_ports().await.unwrap_or_default();
    let host_port = (PREVIEW_PORT_START..=PREVIEW_PORT_END)
        .find(|p| !used.contains(p))
        .unwrap_or(PREVIEW_PORT_START);

    let mut logs = String::new();
    let version_tag = format!("preview-{}", preview_id);
    let built_image = match build_image_from_repo(
        &state,
        &preview_id,
        &app,
        &version_tag,
        &mut logs,
        Some(&branch),
    )
    .await
    {
        Some(tag) => tag,
        None => {
            tracing::warn!("Preview {}: build failed", preview_id);
            let _ = state.db.update_preview_status(&preview_id, "failed").await;
            return;
        }
    };

    let docker = match state.docker.as_ref() {
        Some(d) => d,
        None => {
            tracing::warn!("Preview {}: Docker not available", preview_id);
            let _ = state.db.update_preview_status(&preview_id, "failed").await;
            return;
        }
    };

    let container_name = format!("lightpup-preview-{}", preview_id);
    let container_port = 80u16;
    let deploy_env = state.db.get_deploy_env(&app_id).await.unwrap_or_default();
    match docker
        .create_and_start_container_with_env(
            &container_name,
            &built_image,
            host_port,
            container_port,
            &deploy_env,
        )
        .await
    {
        Ok(container_id) => {
            if let Err(e) = state
                .db
                .update_preview_container(&preview_id, host_port, &container_id, "running")
                .await
            {
                tracing::warn!("Preview {}: failed to update row: {}", preview_id, e);
                let _ = docker.remove_container(&container_id).await;
            }
        }
        Err(e) => {
            tracing::warn!("Preview {}: container start failed: {}", preview_id, e);
            let _ = state.db.update_preview_status(&preview_id, "failed").await;
        }
    }
}

async fn delete_preview(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path((app_id, preview_id)): Path<(String, String)>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&app_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) | Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match stop_and_delete_preview_container(&state, &preview_id).await {
        Ok(_) => Json(serde_json::json!({"deleted": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn cleanup_preview(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    let preview = match state.db.get_preview(&id).await {
        Ok(p) => p,
        Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Preview not found" }))).into_response(),
    };
    let project_id = match state.db.get_project_id_for_application(&preview.application_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) | Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match stop_and_delete_preview_container(&state, &id).await {
        Ok(_) => Json(serde_json::json!({"cleaned": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn stop_and_delete_preview_container(
    state: &AppState,
    preview_id: &str,
) -> Result<(), crate::Error> {
    let preview = state.db.get_preview(preview_id).await?;
    if let Some(ref container_id) = preview.container_id {
        if let Some(ref docker) = *state.docker {
            let _ = docker.stop_container(container_id).await;
            let _ = docker.remove_container(container_id).await;
        }
    }
    state.db.delete_preview(preview_id).await
}
