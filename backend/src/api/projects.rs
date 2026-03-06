//! Projects and environments API.

use crate::api::error::{self, error_response, validate_name};
use crate::api::types::{CreateEnvironmentRequest, CreateProjectRequest};
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
        .route("/api/projects", get(list_projects).post(create_project))
        .route("/api/projects/:id", get(get_project).delete(delete_project))
        .route(
            "/api/projects/:id/environments",
            get(list_environments).post(create_environment),
        )
}

async fn list_projects(State(state): State<AppState>) -> Response {
    match state.db.get_projects().await {
        Ok(projects) => Json(projects).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_project(
    State(state): State<AppState>,
    Json(payload): Json<CreateProjectRequest>,
) -> Response {
    if let Err(msg) = validate_name(&payload.name, error::NAME_MAX_LEN) {
        return error::bad_request("Invalid project name", Some(msg)).into_response();
    }
    let id = Uuid::new_v4().to_string();
    match state.db.create_project(&id, payload.name.trim(), payload.description.as_deref()).await {
        Ok(_) => match state.db.get_project(&id).await {
            Ok(project) => Json(project).into_response(),
            Err(e) => error_response(&e).into_response(),
        },
        Err(e) => error_response(&e).into_response(),
    }
}

async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    match state.db.get_project(&id).await {
        Ok(project) => Json(project).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn delete_project(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    match state.db.delete_project(&id).await {
        Ok(_) => Json(serde_json::json!({"deleted": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn list_environments(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
) -> Response {
    match state.db.get_environments(&project_id).await {
        Ok(envs) => Json(envs).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_environment(
    State(state): State<AppState>,
    Path(project_id): Path<String>,
    Json(payload): Json<CreateEnvironmentRequest>,
) -> Response {
    if let Err(msg) = validate_name(&payload.name, error::NAME_MAX_LEN) {
        return error::bad_request("Invalid environment name", Some(msg)).into_response();
    }
    let id = Uuid::new_v4().to_string();
    match state.db.create_environment(&id, &project_id, payload.name.trim(), payload.is_production).await {
        Ok(_) => match state.db.get_environment(&id).await {
            Ok(env) => Json(env).into_response(),
            Err(e) => error_response(&e).into_response(),
        },
        Err(e) => error_response(&e).into_response(),
    }
}
