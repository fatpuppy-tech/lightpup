//! Invite tokens: create invite (admin) returns link; get/accept invite (public).

use crate::api::auth::{require_admin, CurrentUser};
use crate::api::error::{self, error_response};
use crate::api::types::{AcceptInviteRequest, CreateInviteRequest};
use crate::db::invite_tokens::InviteRow;
use crate::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

/// Base URL for the UI (e.g. https://app.example.com or http://localhost:5173). Used to build invite links.
fn app_base_url() -> String {
    std::env::var("LIGHTPUP_APP_URL").unwrap_or_else(|_| "http://localhost:5173".to_string())
}

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/api/invite/:token", get(get_invite))
        .route("/api/invite/:token/accept", post(accept_invite))
}

pub fn protected_routes() -> Router<AppState> {
    Router::new().route("/api/invites", post(create_invite))
}

async fn create_invite(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Json(payload): Json<CreateInviteRequest>,
) -> Response {
    if let Err(resp) = require_admin(&current_user) {
        return resp;
    }
    let username = payload.username.trim();
    if username.is_empty() || username.len() > 64 {
        return error::bad_request("Invalid username", Some("Username must be 1–64 characters"))
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
    let expires_in_days = payload.expires_in_days.unwrap_or(7).min(365);
    let id = Uuid::new_v4().to_string();
    let token = Uuid::new_v4().to_string();
    let email = payload.email.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    if let Err(e) = state
        .db
        .create_invite_token(&id, &token, username, role, email, expires_in_days)
        .await
    {
        return error_response(&e).into_response();
    }
    let base = app_base_url();
    let invite_link = format!("{}/#/invite?token={}", base.trim_end_matches('/'), token);
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(expires_in_days as i64)).to_rfc3339();
    #[derive(serde::Serialize)]
    struct CreateInviteResponse {
        invite_link: String,
        token: String,
        username: String,
        role: String,
        expires_at: String,
    }
    (
        StatusCode::CREATED,
        Json(CreateInviteResponse {
            invite_link,
            token,
            username: username.to_string(),
            role: role.to_string(),
            expires_at,
        }),
    )
        .into_response()
}

async fn get_invite(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Response {
    match state.db.get_invite_by_token(&token).await {
        Ok(Some(inv)) => Json(serde_json::json!({
            "username": inv.username,
            "role": inv.role,
            "valid": true,
        }))
        .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Invite not found or expired" })),
        )
            .into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn accept_invite(
    State(state): State<AppState>,
    Path(token): Path<String>,
    Json(payload): Json<AcceptInviteRequest>,
) -> Response {
    if payload.password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Password must be at least 8 characters" })),
        )
            .into_response();
    }
    let inv = match state.db.get_invite_by_token(&token).await {
        Ok(Some(i)) => i,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Invite not found or expired" })),
            )
                .into_response()
        }
        Err(e) => return error_response(&e).into_response(),
    };
    // Double-check username not taken (race)
    if state.db.get_user_by_username(&inv.username).await.ok().flatten().is_some() {
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
    let user_id = Uuid::new_v4().to_string();
    if let Err(e) = state
        .db
        .create_user(&user_id, &inv.username, &password_hash, &inv.role)
        .await
    {
        return error_response(&e).into_response();
    }
    if let Err(e) = state.db.mark_invite_used(&inv.id).await {
        tracing::warn!("Invite accepted but failed to mark used: {}", e);
    }
    Json(serde_json::json!({ "ok": true, "username": inv.username })).into_response()
}
