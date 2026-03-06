//! Projects and environments API. Permission: list/get filtered by project_members when set; mutations require member or project role.
use crate::api::auth::CurrentUser;
use crate::api::error::{self, error_response, validate_name};
use crate::api::permissions::{require_admin, require_can_mutate_project, require_can_view_project, require_member, visible_project_ids};
use crate::api::types::{AddProjectMemberRequest, CreateEnvironmentRequest, CreateProjectRequest, EnvVarResponse, SetEnvVarRequest};
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
        .route(
            "/api/projects/:id/members",
            get(list_project_members).post(add_project_member),
        )
        .route("/api/projects/:id/members/:user_id", delete(remove_project_member))
        .route("/api/projects/:id/env", get(list_project_env).post(set_project_env))
        .route("/api/projects/:id/env/:key", delete(delete_project_env))
}

async fn list_projects(
    State(state): State<AppState>,
    current_user: CurrentUser,
) -> Response {
    let projects = match state.db.get_projects().await {
        Ok(p) => p,
        Err(e) => return error_response(&e).into_response(),
    };
    let visible = match visible_project_ids(&state, &current_user.id, &current_user.role).await {
        None => projects,
        Some(ids) => projects.into_iter().filter(|p| ids.contains(&p.id)).collect(),
    };
    Json(visible).into_response()
}

async fn create_project(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Json(payload): Json<CreateProjectRequest>,
) -> Response {
    if let Err(resp) = require_member(&current_user) {
        return resp;
    }
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
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    if let Err(resp) = require_can_view_project(&state, &current_user, &id).await {
        return resp;
    }
    match state.db.get_project(&id).await {
        Ok(project) => Json(project).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn delete_project(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &id).await {
        return resp;
    }
    match state.db.delete_project(&id).await {
        Ok(_) => Json(serde_json::json!({"deleted": true})).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn list_environments(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(project_id): Path<String>,
) -> Response {
    if let Err(resp) = require_can_view_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.get_environments(&project_id).await {
        Ok(envs) => Json(envs).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_environment(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(project_id): Path<String>,
    Json(payload): Json<CreateEnvironmentRequest>,
) -> Response {
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
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

#[derive(serde::Serialize)]
struct ProjectMemberInfo {
    user_id: String,
    username: String,
    role: String,
}

async fn list_project_members(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(project_id): Path<String>,
) -> Response {
    if let Err(resp) = require_can_view_project(&state, &current_user, &project_id).await {
        return resp;
    }
    let members = match state.db.list_project_members(&project_id).await {
        Ok(m) => m,
        Err(e) => return error_response(&e).into_response(),
    };
    let mut out = Vec::with_capacity(members.len());
    for (user_id, role) in members {
        let username = state
            .db
            .get_user_by_id(&user_id)
            .await
            .ok()
            .flatten()
            .map(|u| u.username)
            .unwrap_or_else(|| user_id.clone());
        out.push(ProjectMemberInfo {
            user_id,
            username,
            role,
        });
    }
    Json(out).into_response()
}

async fn add_project_member(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(project_id): Path<String>,
    Json(payload): Json<AddProjectMemberRequest>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    if state.db.get_project(&project_id).await.is_err() {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Project not found" })),
        )
            .into_response();
    }
    if state.db.get_user_by_id(&payload.user_id).await.ok().flatten().is_none() {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "User not found" })),
        )
            .into_response();
    }
    let role = payload
        .role
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("member");
    if !["member", "viewer", "admin"].contains(&role) {
        return error::bad_request("Invalid role", Some("Role must be member, viewer, or admin"))
            .into_response();
    }
    if let Err(e) = state.db.add_project_member(&payload.user_id, &project_id, role).await {
        return error_response(&e).into_response();
    }
    let username = state
        .db
        .get_user_by_id(&payload.user_id)
        .await
        .ok()
        .flatten()
        .map(|u| u.username)
        .unwrap_or_else(|| payload.user_id.clone());
    (
        axum::http::StatusCode::CREATED,
        Json(ProjectMemberInfo {
            user_id: payload.user_id.clone(),
            username,
            role: role.to_string(),
        }),
    )
        .into_response()
}

async fn remove_project_member(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path((project_id, user_id)): Path<(String, String)>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    if let Err(e) = state.db.remove_project_member(&user_id, &project_id).await {
        return error_response(&e).into_response();
    }
    (axum::http::StatusCode::NO_CONTENT, ()).into_response()
}

async fn list_project_env(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(project_id): Path<String>,
) -> Response {
    if let Err(resp) = require_can_view_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.list_project_env(&project_id).await {
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

async fn set_project_env(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(project_id): Path<String>,
    Json(payload): Json<SetEnvVarRequest>,
) -> Response {
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    let key = payload.key.trim();
    if key.is_empty() {
        return error::bad_request("Invalid key", Some("Key cannot be empty")).into_response();
    }
    match state.db.set_project_env(&project_id, key, payload.value.as_str()).await {
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

async fn delete_project_env(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path((project_id, key)): Path<(String, String)>,
) -> Response {
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    if let Err(e) = state.db.delete_project_env(&project_id, &key).await {
        return error_response(&e).into_response();
    }
    (axum::http::StatusCode::NO_CONTENT, ()).into_response()
}
