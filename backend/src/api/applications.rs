//! Applications CRUD API. Mutations require project-level write access; list/get require view.
use crate::api::auth::CurrentUser;
use crate::api::error::{self, error_response, validate_domain_optional, validate_name, validate_port};
use crate::api::permissions::{require_can_mutate_project, require_can_view_project, require_member, visible_project_ids};
use crate::api::types::{CreateApplicationRequest, EnvVarResponse, SetEnvVarRequest, UpdateApplicationRequest};
use crate::AppState;
use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/environments/:id", get(get_environment))
        .route("/api/environments/:id/applications", get(list_applications).post(create_application))
        .route(
            "/api/applications/:id",
            get(get_application)
                .delete(delete_application)
                .put(update_application),
        )
        .route("/api/applications/:id/env", get(list_application_env).post(set_application_env))
        .route("/api/applications/:id/env/:key", delete(delete_application_env))
        .route("/api/applications", get(list_recent_applications))
}

async fn get_environment(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    let env = match state.db.get_environment(&id).await {
        Ok(e) => e,
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_view_project(&state, &current_user, &env.project_id).await {
        return resp;
    }
    Json(env).into_response()
}

async fn list_applications(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(env_id): Path<String>,
) -> Response {
    let env = match state.db.get_environment(&env_id).await {
        Ok(e) => e,
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_view_project(&state, &current_user, &env.project_id).await {
        return resp;
    }
    match state.db.get_applications(&env_id).await {
        Ok(apps) => Json(apps).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_application(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(env_id): Path<String>,
    Json(payload): Json<CreateApplicationRequest>,
) -> Response {
    let env = match state.db.get_environment(&env_id).await {
        Ok(e) => e,
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &env.project_id).await {
        return resp;
    }
    if let Err(msg) = validate_name(&payload.name, error::NAME_MAX_LEN) {
        return error::bad_request("Invalid application name", Some(msg)).into_response();
    }
    if let Err(msg) = validate_domain_optional(payload.domain.as_deref()) {
        return error::bad_request("Invalid domain", Some(msg)).into_response();
    }
    if let Err(msg) = validate_port(payload.port) {
        return error::bad_request("Invalid port", Some(msg)).into_response();
    }
    if payload.image.trim().is_empty() {
        return error::bad_request("Image is required", None::<&str>).into_response();
    }
    let used_ports = match state.db.get_used_host_ports().await {
        Ok(p) => p,
        Err(e) => return error_response(&e).into_response(),
    };
    let port_staging = (payload.port + 1..=65535u16)
        .find(|p| !used_ports.contains(p))
        .unwrap_or(payload.port.wrapping_add(1));
    let id = Uuid::new_v4().to_string();
    let build_type = payload
        .build_type
        .as_deref()
        .unwrap_or("static")
        .to_string();
    match state
        .db
        .create_application(
            &id,
            &env_id,
            payload.name.trim(),
            payload.domain.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()),
            payload.image.trim(),
            payload.port,
            port_staging,
            payload.repo_url.as_deref(),
            payload.repo_branch.as_deref(),
            payload.dockerfile_path.as_deref(),
            payload.dockerfile_content.as_deref(),
            payload.docker_compose_content.as_deref(),
            &build_type,
            payload.server_id.as_deref(),
        )
    .await
    {
        Ok(_) => match state.db.get_application(&id).await {
            Ok(app) => Json(app).into_response(),
            Err(e) => error_response(&e).into_response(),
        },
        Err(e) => error_response(&e).into_response(),
    }
}

async fn get_application(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return error_response(&crate::Error::NotFound(format!("Application {} not found", id))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_view_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.get_application(&id).await {
        Ok(app) => Json(app).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

/// Recent applications for dashboard; filtered by visible projects when user has project_members.
async fn list_recent_applications(
    State(state): State<AppState>,
    current_user: CurrentUser,
) -> Response {
    let visible_ids = visible_project_ids(&state, &current_user.id, &current_user.role).await;
    let apps_with_project: Vec<_> = match state.db.get_recent_applications_with_project_ids(12).await {
        Ok(a) => a,
        Err(e) => return error_response(&e).into_response(),
    };
    let apps: Vec<_> = match &visible_ids {
        None => apps_with_project.into_iter().map(|(app, _)| app).collect(),
        Some(ids) => apps_with_project
            .into_iter()
            .filter(|(_, pid)| ids.contains(pid))
            .map(|(app, _)| app)
            .collect(),
    };
    Json(apps).into_response()
}

async fn update_application(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateApplicationRequest>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return error_response(&crate::Error::NotFound(format!("Application {} not found", id))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    if let Some(ref name) = payload.name {
        if let Err(msg) = validate_name(name, error::NAME_MAX_LEN) {
            return error::bad_request("Invalid application name", Some(msg)).into_response();
        }
    }
    if let Some(ref domain) = payload.domain {
        if let Err(msg) = validate_domain_optional(Some(domain.as_str())) {
            return error::bad_request("Invalid domain", Some(msg)).into_response();
        }
    }
    if let Some(port) = payload.port {
        if let Err(msg) = validate_port(port) {
            return error::bad_request("Invalid port", Some(msg)).into_response();
        }
    }
    if payload.image.as_ref().map(|s| s.trim().is_empty()).unwrap_or(false) {
        return error::bad_request("Image cannot be empty", None::<&str>).into_response();
    }
    match state
        .db
        .update_application(
            &id,
            payload.name.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).as_deref(),
            payload.image.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).as_deref(),
            payload.port,
            payload.domain.as_deref().map(|s| s.trim()),
            payload.repo_url.as_deref(),
            payload.repo_branch.as_deref(),
            payload.dockerfile_path.as_deref(),
            payload.dockerfile_content.as_deref(),
            payload.docker_compose_content.as_deref(),
            payload.build_type.as_deref(),
            payload.server_id.as_ref().map(|o| o.as_deref()),
            payload.health_path.as_ref().map(|o| o.as_deref()),
            payload.health_timeout_secs,
        )
        .await
    {
        Ok(_) => match state.db.get_application(&id).await {
            Ok(app) => Json(app).into_response(),
            Err(e) => error_response(&e).into_response(),
        },
        Err(e) => error_response(&e).into_response(),
    }
}

async fn delete_application(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return error_response(&crate::Error::NotFound(format!("Application {} not found", id))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.delete_application(&id).await {
        Ok(_) => Json(serde_json::json!({"deleted": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn list_application_env(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return error_response(&crate::Error::NotFound(format!("Application {} not found", id))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_view_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.list_application_env(&id).await {
        Ok(vars) => Json(
            vars.into_iter()
                .map(|e| EnvVarResponse {
                    key: e.key,
                    value: e.value,
                })
                .collect::<Vec<_>>(),
        )
        .into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn set_application_env(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<SetEnvVarRequest>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return error_response(&crate::Error::NotFound(format!("Application {} not found", id))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    let key = payload.key.trim();
    if key.is_empty() {
        return error::bad_request("Invalid key", Some("Key cannot be empty")).into_response();
    }
    match state.db.set_application_env(&id, key, payload.value.as_str()).await {
        Ok(_) => (
            axum::http::StatusCode::CREATED,
            Json(EnvVarResponse {
                key: key.to_string(),
                value: payload.value,
            }),
        )
            .into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn delete_application_env(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path((id, key)): Path<(String, String)>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return error_response(&crate::Error::NotFound(format!("Application {} not found", id))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    if let Err(e) = state.db.delete_application_env(&id, &key).await {
        return error_response(&e).into_response();
    }
    (axum::http::StatusCode::NO_CONTENT, ()).into_response()
}
