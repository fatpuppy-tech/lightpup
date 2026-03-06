//! Applications CRUD API.

use crate::api::error::{self, error_response, validate_domain_optional, validate_name, validate_port};
use crate::api::types::{CreateApplicationRequest, UpdateApplicationRequest};
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
        .route("/api/environments/:id/applications", get(list_applications).post(create_application))
        .route(
            "/api/applications/:id",
            get(get_application)
                .delete(delete_application)
                .put(update_application),
        )
        .route("/api/applications", get(list_recent_applications))
}

async fn list_applications(
    State(state): State<AppState>,
    Path(env_id): Path<String>,
) -> Response {
    match state.db.get_applications(&env_id).await {
        Ok(apps) => Json(apps).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_application(
    State(state): State<AppState>,
    Path(env_id): Path<String>,
    Json(payload): Json<CreateApplicationRequest>,
) -> Response {
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
            payload.repo_url.as_deref(),
            payload.repo_branch.as_deref(),
            payload.dockerfile_path.as_deref(),
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
    Path(id): Path<String>,
) -> Response {
    match state.db.get_application(&id).await {
        Ok(app) => Json(app).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

/// Recent applications for dashboard or global views.
async fn list_recent_applications(State(state): State<AppState>) -> Response {
    match state.db.get_recent_applications(12).await {
        Ok(apps) => Json(apps).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn update_application(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateApplicationRequest>,
) -> Response {
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
            payload.build_type.as_deref(),
            payload.server_id.as_ref().map(|o| o.as_deref()),
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
    Path(id): Path<String>,
) -> Response {
    match state.db.delete_application(&id).await {
        Ok(_) => Json(serde_json::json!({"deleted": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}
