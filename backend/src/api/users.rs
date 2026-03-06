//! User management API (admin only).

use crate::api::auth::{require_admin, CurrentUser};
use crate::api::error::{self, error_response};
use crate::api::permissions::permission_keys;
use crate::api::types::{CreateUserRequest, SetUserPermissionsRequest, UpdateUserRequest};
use crate::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, patch, post, put},
    Json, Router,
};
use uuid::Uuid;

/// Public user info (no password). Permissions are additive to role.
#[derive(serde::Serialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub role: String,
    pub created_at: String,
    pub permissions: Vec<String>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/users", get(list_users).post(create_user))
        .route("/api/users/:id", get(get_user).patch(update_user))
        .route("/api/users/:id/permissions", get(get_user_permissions).put(set_user_permissions))
}

async fn list_users(
    State(state): State<AppState>,
    current_user: CurrentUser,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    match state.db.list_users().await {
        Ok(users) => {
            let mut list = Vec::with_capacity(users.len());
            for u in users {
                let permissions = state.db.get_user_permissions(&u.id).await.unwrap_or_default();
                list.push(UserInfo {
                    id: u.id.clone(),
                    username: u.username,
                    role: u.role,
                    created_at: u.created_at,
                    permissions,
                });
            }
            Json(list).into_response()
        }
        Err(e) => error_response(&e).into_response(),
    }
}

async fn get_user(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    let u = match state.db.get_user_by_id(&id).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "User not found" })),
            )
                .into_response()
        }
        Err(e) => return error_response(&e).into_response(),
    };
    let permissions = state.db.get_user_permissions(&u.id).await.unwrap_or_default();
    Json(UserInfo {
        id: u.id,
        username: u.username,
        role: u.role,
        created_at: u.created_at,
        permissions,
    })
    .into_response()
}

async fn create_user(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Json(payload): Json<CreateUserRequest>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    let username = payload.username.trim();
    if username.is_empty() || username.len() > 64 {
        return error::bad_request("Invalid username", Some("Username must be 1–64 characters"))
            .into_response();
    }
    if payload.password.len() < 8 {
        return error::bad_request("Password must be at least 8 characters", None::<&str>)
            .into_response();
    }
    let role = payload
        .role
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("member");
    if !["admin", "member", "viewer"].contains(&role) {
        return error::bad_request("Invalid role", Some("Role must be admin, member, or viewer"))
            .into_response();
    }
    if state.db.get_user_by_username(username).await.ok().flatten().is_some() {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "Username already exists" })),
        )
            .into_response();
    }
    let password_hash = match crate::api::auth::hash_password(&payload.password) {
        Ok(h) => h,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response()
        }
    };
    let id = Uuid::new_v4().to_string();
    if let Err(e) = state.db.create_user(&id, username, &password_hash, role).await {
        return error_response(&e).into_response();
    }
    match state.db.get_user_by_id(&id).await {
        Ok(Some(u)) => {
            let permissions = state.db.get_user_permissions(&u.id).await.unwrap_or_default();
            (
                StatusCode::CREATED,
                Json(UserInfo {
                    id: u.id,
                    username: u.username,
                    role: u.role,
                    created_at: u.created_at,
                    permissions,
                }),
            )
                .into_response()
        }
        Err(e) => error_response(&e).into_response(),
        Ok(None) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "User created but not found" })),
        )
            .into_response(),
    }
}

async fn update_user(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateUserRequest>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    let Some(role) = payload
        .role
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    else {
        return error::bad_request("Role is required", None::<&str>).into_response();
    };
    if !["admin", "member", "viewer"].contains(&role) {
        return error::bad_request("Invalid role", Some("Role must be admin, member, or viewer"))
            .into_response();
    }
    let target = match state.db.get_user_by_id(&id).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "User not found" })),
            )
                .into_response()
        }
        Err(e) => return error_response(&e).into_response(),
    };
    if id == current_user.id {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "You cannot change your own role. Ask another admin to do it."
            })),
        )
            .into_response();
    }
    if target.role == "admin" && role != "admin" {
        let admin_count = state.db.count_users_with_role("admin").await.unwrap_or(0);
        if admin_count <= 1 {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({
                    "error": "Cannot remove the last admin. Promote another user to admin first."
                })),
            )
                .into_response();
        }
    }
    if let Err(e) = state.db.update_user_role(&id, role).await {
        return error_response(&e).into_response();
    }
    match state.db.get_user_by_id(&id).await {
        Ok(Some(u)) => {
            let permissions = state.db.get_user_permissions(&u.id).await.unwrap_or_default();
            Json(UserInfo {
                id: u.id,
                username: u.username,
                role: u.role,
                created_at: u.created_at,
                permissions,
            })
            .into_response()
        }
        Err(e) => error_response(&e).into_response(),
        Ok(None) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "User not found" })),
        )
            .into_response(),
    }
}

fn is_allowed_permission(key: &str) -> bool {
    [
        permission_keys::TERMINAL,
        permission_keys::MANAGE_SERVERS,
        permission_keys::DEPLOY,
        permission_keys::MANAGE_PROJECTS,
        permission_keys::MANAGE_MEMBERS,
    ]
    .contains(&key)
}

async fn get_user_permissions(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    if state.db.get_user_by_id(&id).await.ok().flatten().is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "User not found" })),
        )
            .into_response();
    }
    match state.db.get_user_permissions(&id).await {
        Ok(perms) => Json(serde_json::json!({ "permissions": perms })).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn set_user_permissions(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<SetUserPermissionsRequest>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    if state.db.get_user_by_id(&id).await.ok().flatten().is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "User not found" })),
        )
            .into_response();
    }
    let permissions: Vec<String> = payload
        .permissions
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && is_allowed_permission(s))
        .collect();
    if let Err(e) = state.db.set_user_permissions(&id, &permissions).await {
        return error_response(&e).into_response();
    }
    match state.db.get_user_permissions(&id).await {
        Ok(perms) => Json(serde_json::json!({ "permissions": perms })).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}
