//! Servers (nodes) CRUD.

use crate::api::auth::CurrentUser;
use crate::api::permissions::{require_can_manage_servers, require_can_use_terminal};
use crate::api::error::{self, error_response, validate_name};
use crate::api::types::{CreateServerRequest, UpdateServerRequest};
use crate::AppState;
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use axum::extract::ws::Message;
use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use uuid::Uuid;
use pty_process::Size;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/servers", get(list_servers).post(create_server))
        .route(
            "/api/servers/:id",
            get(get_server).put(update_server).delete(delete_server),
        )
        .route("/api/servers/:id/terminal/ws", get(server_terminal_ws))
}

async fn list_servers(State(state): State<AppState>) -> Response {
    match state.db.get_nodes().await {
        Ok(nodes) => Json(nodes).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_server(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Json(payload): Json<CreateServerRequest>,
) -> Response {
    if let Err(resp) = require_can_manage_servers(&state, &current_user).await {
        return resp;
    }
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
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateServerRequest>,
) -> Response {
    if let Err(resp) = require_can_manage_servers(&state, &current_user).await {
        return resp;
    }
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
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    if let Err(resp) = require_can_manage_servers(&state, &current_user).await {
        return resp;
    }
    match state.db.delete_node(&id).await {
        Ok(_) => Json(serde_json::json!({ "deleted": true })).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

fn is_local_server(addr: &str, ssh_user: Option<&str>) -> bool {
    let addr = addr.trim();
    let is_localhost = addr.eq_ignore_ascii_case("localhost") || addr == "127.0.0.1";
    let is_ssh_remote = ssh_user.is_some() || addr.starts_with("ssh ") || addr.contains('@');
    is_localhost || !is_ssh_remote
}

async fn server_terminal_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    if let Err(resp) = require_can_use_terminal(&state, &current_user).await {
        return resp;
    }
    let node = match state.db.get_node(&id).await {
        Ok(n) => n,
        Err(e) => return error_response(&e).into_response(),
    };

    let use_local = is_local_server(node.address.trim(), node.ssh_user.as_deref());

    ws.on_upgrade(move |socket| async move {
        if use_local {
            run_local_terminal(socket).await;
        } else {
            run_ssh_terminal(
                socket,
                node.address.trim(),
                node.ssh_user.as_deref(),
                node.ssh_key_path.as_deref(),
            )
            .await;
        }
    })
}

fn parse_resize(text: &str) -> Option<(u16, u16)> {
    let v: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let ty = v.get("type")?.as_str()?;
    if ty != "resize" {
        return None;
    }
    let rows = v.get("rows")?.as_u64()? as u16;
    let cols = v.get("cols")?.as_u64()? as u16;
    if rows > 0 && cols > 0 {
        Some((rows, cols))
    } else {
        None
    }
}

async fn run_local_terminal(mut socket: axum::extract::ws::WebSocket) {
    let (mut pty, pts) = match pty_process::open() {
        Ok(p) => p,
        Err(e) => {
            let _ = socket
                .send(Message::Text(format!("Failed to allocate PTY: {}", e)))
                .await;
            return;
        }
    };
    if pty.resize(Size::new(24, 80)).is_err() {
        // non-fatal, continue with default size
    }
    let mut child = match pty_process::Command::new("bash")
        .args(["-l", "-i"])
        .spawn(pts)
    {
        Ok(c) => c,
        Err(e) => {
            let _ = socket
                .send(Message::Text(format!("Failed to start shell: {}", e)))
                .await;
            return;
        }
    };
    // Keep pty unsplit so we can resize it when the client sends resize messages.
    let mut buf = [0u8; 4096];
    loop {
        tokio::select! {
            result = socket.recv() => {
                match result {
                    Some(Ok(Message::Text(text))) => {
                        if let Some((rows, cols)) = parse_resize(&text) {
                            let _ = pty.resize(Size::new(rows, cols));
                        } else if pty.write_all(text.as_bytes()).await.is_err()
                            || pty.flush().await.is_err()
                        {
                            break;
                        }
                    }
                    None | Some(Err(_)) | Some(Ok(Message::Close(_))) => break,
                    _ => {}
                }
            }
            result = pty.read(&mut buf) => {
                match result {
                    Ok(0) => break,
                    Ok(n) => {
                        let msg = String::from_utf8_lossy(&buf[..n]).to_string();
                        if socket.send(Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        }
    }

    let _ = child.kill().await;
}

async fn run_ssh_terminal(
    mut socket: axum::extract::ws::WebSocket,
    addr: &str,
    ssh_user: Option<&str>,
    ssh_key_path: Option<&str>,
) {
    let host = addr.strip_prefix("ssh ").unwrap_or(addr).trim();
    let ssh_target = if let Some(user) = ssh_user {
        format!("{}@{}", user, host)
    } else {
        host.to_string()
    };
    let ssh_key_path = ssh_key_path.map(String::from);

    let mut cmd = tokio::process::Command::new("ssh");
    if let Some(ref key_path) = ssh_key_path {
        cmd.arg("-i").arg(key_path);
    }
    cmd.arg("-o")
        .arg("StrictHostKeyChecking=no")
        .arg("-o")
        .arg("UserKnownHostsFile=/dev/null")
        .arg("-t")
        .arg("-t")
        .arg(&ssh_target)
        .arg("bash -l")
        .arg("-i");

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::piped());

    match cmd.spawn() {
        Ok(mut child) => {
            let mut child_stdout = child.stdout.take().unwrap();
            let mut child_stderr = child.stderr.take().unwrap();
            let mut child_stdin = child.stdin.take().unwrap();

            let mut buf_out = [0u8; 1024];
            let mut buf_err = [0u8; 1024];

            loop {
                tokio::select! {
                    result = socket.recv() => {
                        match result {
                            Some(Ok(Message::Text(text))) => {
                                // Ignore resize messages (SSH doesn't support window change from our pipe).
                                if parse_resize(&text).is_none() {
                                    let _ = child_stdin.write_all(text.as_bytes()).await;
                                    let _ = child_stdin.flush().await;
                                }
                            }
                            None | Some(Err(_)) | Some(Ok(Message::Close(_))) => break,
                            _ => {}
                        }
                    }
                    result = child_stdout.read(&mut buf_out) => {
                        match result {
                            Ok(0) | Err(_) => {}
                            n => {
                                let msg = String::from_utf8_lossy(&buf_out[..n.unwrap_or(0)]).to_string();
                                let _ = socket.send(Message::Text(msg)).await;
                            }
                        }
                    }
                    result = child_stderr.read(&mut buf_err) => {
                        match result {
                            Ok(0) | Err(_) => {}
                            n => {
                                let msg = String::from_utf8_lossy(&buf_err[..n.unwrap_or(0)]).to_string();
                                let _ = socket.send(Message::Text(msg)).await;
                            }
                        }
                    }
                }
            }

            let _ = child.kill().await;
        }
        Err(e) => {
            let msg = format!("Failed to connect: {}", e);
            let _ = socket.send(Message::Text(msg)).await;
        }
    }
}
