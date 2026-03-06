//! GitHub OAuth + local login with 2FA (TOTP authenticator app).
//! Multi-user: CurrentUser (id, username, role) attached in auth middleware; role is admin | member | viewer.

use crate::db::User;
use crate::AppState;
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use std::pin::Pin;
use axum::{
    extract::{FromRequestParts, Query, State},
    http::{request::Parts, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use axum_extra::extract::CookieJar;
use cookie::{Cookie, SameSite, time::Duration};
use serde::Deserialize;
use totp_rs::{Algorithm, Secret, TOTP};
use uuid::Uuid;

/// Authenticated user attached to request by middleware. Use as extractor in handlers that need role checks.
#[derive(Clone, Debug)]
pub struct CurrentUser {
    pub id: String,
    pub username: String,
    pub role: String,
}

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, Json<serde_json::Value>);

    fn from_request_parts<'life0, 'life1, 'async_trait>(
        parts: &'life0 mut Parts,
        _state: &'life1 S,
    ) -> Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Rejection>> + Send + 'async_trait>>
    where
        Self: 'async_trait,
        'life0: 'async_trait,
        'life1: 'async_trait,
    {
        Box::pin(async move {
            parts
                .extensions
                .get::<CurrentUser>()
                .cloned()
                .ok_or_else(|| {
                    (
                        StatusCode::UNAUTHORIZED,
                        Json(serde_json::json!({ "error": "Not authenticated" })),
                    )
                })
        })
    }
}

/// Call in mutation handlers (POST/PATCH/DELETE). Returns 403 if current user is viewer.
pub fn require_member(user: &CurrentUser) -> Result<(), Response> {
    crate::api::permissions::require_member(user)
}

/// Call in admin-only handlers (e.g. user management). Returns 403 if not admin.
pub fn require_admin(user: &CurrentUser) -> Result<(), Response> {
    crate::api::permissions::require_admin(user)
}

pub const SESSION_COOKIE: &str = "lp_session";
const PENDING_2FA_COOKIE: &str = "lp_pending_2fa";
const SESSION_MAX_AGE_DAYS: i64 = 30;
const PENDING_2FA_MAX_AGE_MINS: i64 = 5;

fn is_public_auth_path(path: &str) -> bool {
    if matches!(
        path,
        "/api/auth/setup" | "/api/auth/login" | "/api/auth/2fa/verify" | "/api/auth/setup-required"
    ) {
        return true;
    }
    // Invite get/accept are public (token in path)
    if path.starts_with("/api/invite/") {
        return true;
    }
    false
}

/// Middleware: require valid session for /api/* (except public auth paths) and attach CurrentUser to request.
pub async fn require_auth_middleware(
    State(state): State<AppState>,
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let path = req.uri().path();
    tracing::debug!("Middleware: path = {}", path);
    if !path.starts_with("/api/") || is_public_auth_path(path) {
        tracing::debug!("Middleware: skipping auth for {}", path);
        return next.run(req).await;
    }
    let jar = CookieJar::from_headers(req.headers());
    let token = match jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        Some(t) => t,
        None => {
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response();
        }
    };
    let user_id = match state.db.get_session_user_id(&token).await {
        Ok(Some(id)) => id,
        _ => {
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response();
        }
    };
    let user = match state.db.get_user_by_id(&user_id).await {
        Ok(Some(u)) => u,
        _ => {
            return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response();
        }
    };
    let current_user = CurrentUser {
        id: user.id,
        username: user.username,
        role: user.role,
    };
    let (mut parts, body) = req.into_parts();
    parts.extensions.insert(current_user);
    let req = Request::from_parts(parts, body);
    next.run(req).await
}

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/api/auth/setup-required", get(auth_setup_required))
        .route("/api/auth/setup", post(auth_setup))
        .route("/api/auth/login", post(auth_login))
        .route("/api/auth/2fa/verify", post(auth_2fa_verify))
}

pub fn protected_routes() -> Router<AppState> {
    Router::new()
        .route("/auth/github/start", get(github_oauth_start))
        .route("/auth/github/callback", get(github_oauth_callback))
        .route(
            "/api/integrations/github",
            get(github_integration_status).delete(github_integration_disconnect),
        )
        .route("/api/auth/logout", post(auth_logout))
        .route("/api/auth/me", get(auth_me))
        .route("/api/auth/2fa/status", get(auth_2fa_status))
        .route("/api/auth/2fa/setup", get(auth_2fa_setup))
        .route("/api/auth/2fa/confirm", post(auth_2fa_confirm))
        .route("/api/auth/change-password", post(auth_change_password))
}

#[allow(dead_code)]
pub fn routes() -> Router<AppState> {
    Router::new()
        .merge(public_routes())
        .merge(protected_routes())
}

fn github_oauth_config() -> Option<(String, String, String)> {
    let client_id = std::env::var("GITHUB_OAUTH_CLIENT_ID").ok()?;
    let client_secret = std::env::var("GITHUB_OAUTH_CLIENT_SECRET").ok()?;
    let base_url = std::env::var("GITHUB_OAUTH_BASE_URL")
        .unwrap_or_else(|_| "http://localhost:5173".to_string());
    Some((client_id, client_secret, base_url))
}

async fn github_oauth_start(jar: CookieJar) -> Response {
    let (client_id, _, base_url) = match github_oauth_config() {
        Some(t) => t,
        None => {
            return Redirect::temporary("/#/settings?github=error&message=config")
                .into_response();
        }
    };
    let state_param = Uuid::new_v4().to_string();
    let cookie = Cookie::build(("github_oauth_state", state_param.clone()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::minutes(10))
        .build();
    let redirect_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=repo&state={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(&format!("{}/auth/github/callback", base_url)),
        urlencoding::encode(&state_param),
    );
    let jar = jar.add(cookie);
    (jar, Redirect::temporary(&redirect_url)).into_response()
}

#[derive(Deserialize)]
struct GithubCallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct GithubTokenResponse {
    access_token: String,
    #[allow(dead_code)]
    scope: Option<String>,
    #[allow(dead_code)]
    token_type: Option<String>,
}

async fn github_oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<GithubCallbackQuery>,
    jar: CookieJar,
) -> Response {
    let (client_id, client_secret, base_url) = match github_oauth_config() {
        Some(t) => t,
        None => {
            return Redirect::temporary("/ui/#/settings?github=error&message=config")
                .into_response();
        }
    };
    let redirect_uri = format!("{}/auth/github/callback", base_url);
    let ui_redirect = format!("{}/ui/#/settings", base_url);

    if query.error.is_some() {
        let msg = query.error.as_deref().unwrap_or("unknown");
        return Redirect::temporary(&format!(
            "{}?github=error&message={}",
            ui_redirect,
            urlencoding::encode(msg)
        ))
        .into_response();
    }

    let code = match &query.code {
        Some(c) => c.clone(),
        None => {
            return Redirect::temporary(&format!("{}?github=error&message=missing_code", ui_redirect))
                .into_response();
        }
    };
    let state_param = match &query.state {
        Some(s) => s.clone(),
        None => {
            return Redirect::temporary(&format!("{}?github=error&message=missing_state", ui_redirect))
                .into_response();
        }
    };

    let cookie_state = jar.get("github_oauth_state").map(|c| c.value().to_string());
    if cookie_state.as_deref() != Some(state_param.as_str()) {
        return Redirect::temporary(&format!("{}?github=error&message=invalid_state", ui_redirect))
            .into_response();
    }

    let body = serde_json::json!({
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
    });
    let client = reqwest::Client::new();
    let resp = match client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("GitHub token exchange request failed: {}", e);
            return Redirect::temporary(&format!(
                "{}?github=error&message=exchange_failed",
                ui_redirect
            ))
            .into_response();
        }
    };
    let token_resp: GithubTokenResponse = match resp.json().await {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!("GitHub token response parse failed: {}", e);
            return Redirect::temporary(&format!(
                "{}?github=error&message=exchange_failed",
                ui_redirect
            ))
            .into_response();
        }
    };

    if let Err(e) = state.db.set_setting("github_token", &token_resp.access_token).await {
        tracing::warn!("Failed to store GitHub token: {}", e);
        return Redirect::temporary(&format!(
            "{}?github=error&message=store_failed",
            ui_redirect
        ))
        .into_response();
    }

    Redirect::temporary(&format!("{}?github=connected", ui_redirect)).into_response()
}

async fn github_integration_status(State(state): State<AppState>) -> Response {
    let connected = state
        .db
        .get_setting("github_token")
        .await
        .ok()
        .flatten()
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    Json(serde_json::json!({ "connected": connected })).into_response()
}

async fn github_integration_disconnect(State(state): State<AppState>) -> Response {
    match state.db.delete_setting("github_token").await {
        Ok(()) => Json(serde_json::json!({ "disconnected": true })).into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ---- Local auth (login + 2FA) ----

pub(crate) fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    let parsed = PasswordHash::new(hash).map_err(|e| e.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

fn cookie_jar_remove(jar: CookieJar, name: &str) -> CookieJar {
    let c = Cookie::build((name.to_string(), ""))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .removal()
        .build();
    jar.add(c)
}

/// Registration is only allowed when there are no users. Returns whether setup (first-user registration) is allowed.
async fn auth_setup_required(State(state): State<AppState>) -> Response {
    tracing::debug!("Checking if setup is required");
    let required = match state.db.count_users().await {
        Ok(0) => true,
        Ok(n) => {
            tracing::debug!("Found {} users", n);
            false
        }
        Err(e) => {
            tracing::error!("Error counting users: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
        }
    };
    Json(serde_json::json!({ "required": required })).into_response()
}

#[derive(Deserialize)]
struct AuthSetupBody {
    username: String,
    password: String,
}

/// Create the first user (registration). Only allowed when there are no users; if at least one user exists, registration is forbidden.
async fn auth_setup(State(state): State<AppState>, Json(body): Json<AuthSetupBody>) -> Response {
    let count = match state.db.count_users().await {
        Ok(n) => n,
        Err(e) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    if count > 0 {
        return (
            axum::http::StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "Registration is not allowed. At least one account already exists." })),
        )
            .into_response();
    }
    let username = body.username.trim();
    if username.is_empty() || username.len() > 64 {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid username" }))).into_response();
    }
    if body.password.len() < 8 {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Password must be at least 8 characters" }))).into_response();
    }
    let password_hash = match hash_password(&body.password) {
        Ok(h) => h,
        Err(e) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };
    let id = Uuid::new_v4().to_string();
    if let Err(e) = state.db.create_user(&id, username, &password_hash, "admin").await {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response();
    }
    (axum::http::StatusCode::CREATED, Json(serde_json::json!({ "ok": true }))).into_response()
}

#[derive(Deserialize)]
struct AuthLoginBody {
    username: String,
    password: String,
}

async fn auth_login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<AuthLoginBody>,
) -> Response {
    let user = match state.db.get_user_by_username(body.username.trim()).await {
        Ok(Some(u)) => u,
        Ok(None) => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Invalid username or password" }))).into_response(),
        Err(e) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    if !verify_password(&body.password, &user.password_hash).unwrap_or(false) {
        return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Invalid username or password" }))).into_response();
    }
    if let Some(ref _secret_b32) = user.totp_secret {
        let pending_token = Uuid::new_v4().to_string();
        if state.db.create_pending_2fa(&pending_token, &user.id).await.is_err() {
            return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Server error" }))).into_response();
        }
        let cookie = Cookie::build((PENDING_2FA_COOKIE, pending_token))
            .path("/")
            .http_only(true)
            .same_site(SameSite::Lax)
            .max_age(Duration::minutes(PENDING_2FA_MAX_AGE_MINS))
            .build();
        return (
            jar.add(cookie),
            (axum::http::StatusCode::OK, Json(serde_json::json!({ "needs_2fa": true }))),
        )
            .into_response();
    }
    create_session_and_response(&state, &user, jar).await
}

async fn create_session_and_response(state: &AppState, user: &User, jar: CookieJar) -> Response {
    let session_id = Uuid::new_v4().to_string();
    let token = Uuid::new_v4().to_string();
    if state.db.create_session(&session_id, &user.id, &token).await.is_err() {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Server error" }))).into_response();
    }
    let cookie = Cookie::build((SESSION_COOKIE, token.clone()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::days(SESSION_MAX_AGE_DAYS))
        .build();
    (
        jar.add(cookie),
        (axum::http::StatusCode::OK, Json(serde_json::json!({ "ok": true, "username": user.username }))),
    )
        .into_response()
}

#[derive(Deserialize)]
struct Auth2faVerifyBody {
    code: String,
}

async fn auth_2fa_verify(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<Auth2faVerifyBody>,
) -> Response {
    let pending_token = match jar.get(PENDING_2FA_COOKIE).map(|c| c.value().to_string()) {
        Some(t) => t,
        None => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Session expired. Please log in again." }))).into_response(),
    };
    let user_id = match state.db.get_pending_2fa_user_id(&pending_token).await {
        Ok(Some(id)) => id,
        _ => {
            let jar = cookie_jar_remove(jar, PENDING_2FA_COOKIE);
            return (jar, (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Session expired. Please log in again." })))).into_response();
        }
    };
    let user = match state.db.get_user_by_id(&user_id).await {
        Ok(Some(u)) => u,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Invalid session" }))).into_response(),
    };
    let secret_b32 = match &user.totp_secret {
        Some(s) => s,
        None => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "2FA not enabled" }))).into_response(),
    };
    let secret_bytes = match Secret::Encoded(secret_b32.clone()).to_bytes() {
        Ok(b) => b,
        Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Invalid 2FA secret" }))).into_response(),
    };
    let totp = match TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret_bytes,
        Some("LightPup".to_string()),
        user.username.clone(),
    ) {
        Ok(t) => t,
        Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Invalid 2FA config" }))).into_response(),
    };
    let code = body.code.replace(' ', "").trim().to_string();
    if !totp.check_current(&code).unwrap_or(false) {
        return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Invalid code" }))).into_response();
    }
    let _ = state.db.delete_pending_2fa(&pending_token).await;
    let jar = cookie_jar_remove(jar, PENDING_2FA_COOKIE);
    create_session_and_response(&state, &user, jar).await
}

async fn auth_logout(State(state): State<AppState>, jar: CookieJar) -> Response {
    if let Some(c) = jar.get(SESSION_COOKIE) {
        let token = c.value();
        let _ = state.db.delete_session_by_token(token).await;
    }
    let jar = cookie_jar_remove(jar, SESSION_COOKIE);
    (jar, (axum::http::StatusCode::OK, Json(serde_json::json!({ "ok": true })))).into_response()
}

async fn auth_me(State(state): State<AppState>, jar: CookieJar) -> Response {
    let token = match jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        Some(t) => t,
        None => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user_id = match state.db.get_session_user_id(&token).await {
        Ok(Some(id)) => id,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user = match state.db.get_user_by_id(&user_id).await {
        Ok(Some(u)) => u,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let permissions = state.db.get_user_permissions(&user.id).await.unwrap_or_default();
    Json(serde_json::json!({
        "username": user.username,
        "id": user.id,
        "role": user.role,
        "permissions": permissions,
    }))
    .into_response()
}

async fn auth_2fa_status(State(state): State<AppState>, jar: CookieJar) -> Response {
    let token = match jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        Some(t) => t,
        None => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user_id = match state.db.get_session_user_id(&token).await {
        Ok(Some(id)) => id,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user = match state.db.get_user_by_id(&user_id).await {
        Ok(Some(u)) => u,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    Json(serde_json::json!({ "enabled": user.totp_secret.is_some() })).into_response()
}

async fn auth_2fa_setup(State(state): State<AppState>, jar: CookieJar) -> Response {
    let token = match jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        Some(t) => t,
        None => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user_id = match state.db.get_session_user_id(&token).await {
        Ok(Some(id)) => id,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user = match state.db.get_user_by_id(&user_id).await {
        Ok(Some(u)) => u,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    if user.totp_secret.is_some() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "2FA already enabled" }))).into_response();
    }
    let secret = Secret::generate_secret();
    let secret_bytes = match secret.to_bytes() {
        Ok(b) => b,
        Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to generate 2FA" }))).into_response(),
    };
    let totp = match TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret_bytes.clone(),
        Some("LightPup".to_string()),
        user.username.clone(),
    ) {
        Ok(t) => t,
        Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to generate 2FA" }))).into_response(),
    };
    let secret_b32 = totp.get_secret_base32();
    let qr_uri = totp.get_url();
    let pending_key = format!("pending_totp_secret:{}", user.id);
    if state.db.set_setting(&pending_key, &secret_b32).await.is_err() {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to save pending secret" }))).into_response();
    }
    Json(serde_json::json!({
        "secret_base32": secret_b32,
        "qr_uri": qr_uri
    }))
        .into_response()
}

#[derive(Deserialize)]
struct Auth2faConfirmBody {
    code: String,
}

async fn auth_2fa_confirm(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<Auth2faConfirmBody>,
) -> Response {
    let token = match jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        Some(t) => t,
        None => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user_id = match state.db.get_session_user_id(&token).await {
        Ok(Some(id)) => id,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user = match state.db.get_user_by_id(&user_id).await {
        Ok(Some(u)) => u,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    if user.totp_secret.is_some() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "2FA already enabled" }))).into_response();
    }
    let pending_key = format!("pending_totp_secret:{}", user.id);
    let secret_b32 = match state.db.get_setting(&pending_key).await {
        Ok(Some(s)) if !s.is_empty() => s,
        _ => return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "2FA setup not started or expired. Use GET /api/auth/2fa/setup first." }))).into_response(),
    };
    let secret_bytes = match Secret::Encoded(secret_b32.clone()).to_bytes() {
        Ok(b) => b,
        Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Invalid secret" }))).into_response(),
    };
    let totp = match TOTP::new(
        Algorithm::SHA1,
        6,
        1,
        30,
        secret_bytes,
        Some("LightPup".to_string()),
        user.username.clone(),
    ) {
        Ok(t) => t,
        Err(_) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Invalid 2FA config" }))).into_response(),
    };
    let code = body.code.replace(' ', "").trim().to_string();
    if !totp.check_current(&code).unwrap_or(false) {
        return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Invalid code" }))).into_response();
    }
    if state.db.set_user_totp(&user.id, Some(&secret_b32)).await.is_err() {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to save 2FA" }))).into_response();
    }
    let _ = state.db.delete_setting(&pending_key).await;
    Json(serde_json::json!({ "ok": true })).into_response()
}

#[derive(Deserialize)]
struct ChangePasswordBody {
    current_password: String,
    new_password: String,
}

async fn auth_change_password(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<ChangePasswordBody>,
) -> Response {
    let token = match jar.get(SESSION_COOKIE).map(|c| c.value().to_string()) {
        Some(t) => t,
        None => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user_id = match state.db.get_session_user_id(&token).await {
        Ok(Some(id)) => id,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    let user = match state.db.get_user_by_id(&user_id).await {
        Ok(Some(u)) => u,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))).into_response(),
    };
    if !verify_password(&body.current_password, &user.password_hash).unwrap_or(false) {
        return (axum::http::StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Current password is incorrect" }))).into_response();
    }
    if body.new_password.len() < 8 {
        return (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "New password must be at least 8 characters" }))).into_response();
    }
    let password_hash = match hash_password(&body.new_password) {
        Ok(h) => h,
        Err(e) => return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e }))).into_response(),
    };
    if state.db.set_user_password(&user.id, &password_hash).await.is_err() {
        return (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": "Failed to update password" }))).into_response();
    }
    Json(serde_json::json!({ "ok": true })).into_response()
}
