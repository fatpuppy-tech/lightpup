//! Servers (nodes) CRUD.

use crate::api::error::{self, error_response, validate_name};
use crate::api::types::{CreateServerRequest, UpdateServerRequest};
use crate::db::Node;
use crate::AppState;
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/servers", get(list_servers).post(create_server))
        .route(
            "/api/servers/:id",
            get(get_server).put(update_server).delete(delete_server),
        )
        // .route("/api/servers/:id/terminal/ws", get(server_terminal_ws))
}

async fn list_servers(State(state): State<AppState>) -> Response {
    match state.db.get_nodes().await {
        Ok(nodes) => Json(nodes).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_server(
    State(state): State<AppState>,
    Json(payload): Json<CreateServerRequest>,
) -> Response {
    if let Err(msg) = validate_name(&payload.name, error::NAME_MAX_LEN) {
        return error::bad_request("Invalid server name", Some(msg)).into_response();
    }
    if payload.address.trim().is_empty() {
        return error::bad_request("Address is required", None::<&str>).into_response();
    }
    if payload.address.len() > 512 {
        return error::bad_request("Address is too long", Some("Address must be at most 512 characters")).into_response();
    }
    let id = Uuid::new_v4().to_string();
    let is_active = payload.is_active.unwrap_or(true);
    if let Err(e) = state.db.create_node(
        &id,
        payload.name.trim(),
        payload.address.trim(),
        payload.ssh_user.as_deref(),
        payload.ssh_key_path.as_deref(),
        payload.ssh_key_content.as_deref(),
        is_active,
    )
    .await
    {
        return error_response(&e).into_response();
    }
    match state.db.get_node(&id).await {
        Ok(node) => Json(node).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn get_server(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    match state.db.get_node(&id).await {
        Ok(node) => Json(node).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn update_server(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateServerRequest>,
) -> Response {
    if let Some(ref name) = payload.name {
        if let Err(msg) = validate_name(name, error::NAME_MAX_LEN) {
            return error::bad_request("Invalid server name", Some(msg)).into_response();
        }
    }
    if payload.address.as_ref().map(|s| s.trim().is_empty()).unwrap_or(false) {
        return error::bad_request("Address cannot be empty", None::<&str>).into_response();
    }
    if payload.address.as_ref().map(|s| s.len() > 512).unwrap_or(false) {
        return error::bad_request("Address is too long", Some("Address must be at most 512 characters")).into_response();
    }
    if let Err(e) = state.db.update_node(
        &id,
        payload.name.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).as_deref(),
        payload.address.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).as_deref(),
        payload.ssh_user.as_deref(),
        payload.ssh_key_path.as_deref(),
        payload.ssh_key_content.as_deref(),
        payload.is_active,
    )
    .await
    {
        return error_response(&e).into_response();
    }
    match state.db.get_node(&id).await {
        Ok(node) => Json(node).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn delete_server(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    match state.db.delete_node(&id).await {
        Ok(_) => Json(serde_json::json!({ "deleted": true })).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn server_terminal_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    (axum::http::StatusCode::NOT_IMPLEMENTED, "Terminal not available").into_response()
}
