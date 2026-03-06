//! Preview environments API.

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

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/applications/:id/previews", get(list_previews).post(create_preview))
        .route("/api/applications/:id/previews/:preview_id", delete(delete_preview))
        .route("/api/previews/:id/cleanup", post(cleanup_preview))
}

async fn list_previews(
    State(state): State<AppState>,
    Path(app_id): Path<String>,
) -> Response {
    match state.db.get_previews(&app_id).await {
        Ok(previews) => Json(previews).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_preview(
    State(state): State<AppState>,
    Path(app_id): Path<String>,
    Json(payload): Json<CreatePreviewRequest>,
) -> Response {
    let id = Uuid::new_v4().to_string();
    let slug = payload
        .branch
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let url = format!("{}.preview.localhost", slug);
    let expires_at = payload.expires_in_days.map(|days| {
        (chrono::Utc::now() + chrono::Duration::days(days as i64)).to_rfc3339()
    });

    if let Err(e) =
        state.db.create_preview(&id, &app_id, &payload.branch, &url, expires_at.as_deref()).await
    {
        return error_response(&e).into_response();
    }

    match state.db.get_preview(&id).await {
        Ok(preview) => Json(preview).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn delete_preview(
    State(state): State<AppState>,
    Path((_app_id, preview_id)): Path<(String, String)>,
) -> Response {
    match state.db.delete_preview(&preview_id).await {
        Ok(_) => Json(serde_json::json!({"deleted": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn cleanup_preview(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    match state.db.delete_preview(&id).await {
        Ok(_) => Json(serde_json::json!({"cleaned": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}
