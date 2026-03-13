//! Servers (nodes) CRUD.

use crate::api::auth::CurrentUser;
use crate::api::permissions::{require_can_manage_servers, require_can_use_terminal};
use crate::api::error::{self, error_response, validate_name};
use crate::api::types::{
    CreateServerRequest, RunServerCommandRequest, RunServerCommandResponse,
    UpdateServerRequest,
};
use crate::AppState;
use crate::db::Node;
use std::os::unix::fs::PermissionsExt;
use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use axum::extract::ws::Message;
use std::process::{Command as StdCommand, Stdio};
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
        .route("/api/servers/:id/commands", post(run_server_command))
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

/// Predefined commands: apt_update, apt_upgrade, apt_list_upgradable, docker_prune
fn command_for_action(action: &str) -> Option<&'static str> {
    match action {
        "apt_update" => Some("sudo apt-get update"),
        "apt_upgrade" => Some("sudo apt-get upgrade -y"),
        "apt_list_upgradable" => Some("sudo apt list --upgradable 2>&1"),
        "docker_prune" => Some("docker system prune -f"),
        _ => None,
    }
}

async fn run_server_command(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<RunServerCommandRequest>,
) -> Response {
    if let Err(resp) = require_can_manage_servers(&state, &current_user).await {
        return resp;
    }
    let cmd = match command_for_action(payload.action.trim()) {
        Some(c) => c,
        None => {
            return error::bad_request(
                "Invalid action",
                Some("Action must be one of: apt_update, apt_upgrade, apt_list_upgradable, docker_prune"),
            )
            .into_response();
        }
    };
    let node = match state.db.get_node(&id).await {
        Ok(n) => n,
        Err(e) => return error_response(&e).into_response(),
    };
    let sudo_password = payload.sudo_password;
    let result = tokio::task::spawn_blocking(move || {
        run_command_on_node(&node, cmd, sudo_password.as_deref())
    })
    .await;
    match result {
        Ok(Ok(resp)) => Json(resp).into_response(),
        Ok(Err(e)) => error_response(&e).into_response(),
        Err(e) => error_response(&crate::Error::Internal(e.to_string())).into_response(),
    }
}

fn run_command_on_node(
    node: &Node,
    cmd: &str,
    sudo_password: Option<&str>,
) -> Result<RunServerCommandResponse, crate::Error> {
    use std::io::Write;
    let use_local = is_local_server(node.address.trim(), node.ssh_user.as_deref());
    if use_local {
        let (run_cmd, stdin_content) = if cmd.starts_with("sudo ") && sudo_password.is_some() {
            let rest = &cmd[5..];
            let escaped = rest.replace('\'', "'\"'\"'");
            let run_cmd = format!("sudo -S sh -c '{}'", escaped);
            let pw = sudo_password.unwrap_or("");
            let stdin_content = format!("{}\n", pw);
            (run_cmd, Some(stdin_content))
        } else {
            (cmd.to_string(), None)
        };

        let output = if let Some(stdin_str) = stdin_content {
            let mut child = StdCommand::new("sh")
                .args(["-c", &run_cmd])
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| crate::Error::Internal(format!("Failed to run command: {}", e)))?;
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(stdin_str.as_bytes());
                let _ = stdin.flush();
            }
            child
                .wait_with_output()
                .map_err(|e| crate::Error::Internal(format!("Failed to run command: {}", e)))?
        } else {
            StdCommand::new("sh")
                .args(["-c", &run_cmd])
                .output()
                .map_err(|e| crate::Error::Internal(format!("Failed to run command: {}", e)))?
        };
        let out = String::from_utf8_lossy(&output.stdout).to_string();
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if err.is_empty() {
            out
        } else {
            format!("{}\n{}", out, err)
        };
        Ok(RunServerCommandResponse {
            output: combined,
            exit_code: output.status.code().unwrap_or(-1),
        })
    } else {
        let addr = node.address.trim();
        let host = addr.strip_prefix("ssh ").unwrap_or(addr).trim();
        let ssh_target = node
            .ssh_user
            .as_deref()
            .map(|u| format!("{}@{}", u, host))
            .unwrap_or_else(|| host.to_string());

        let (remote_cmd, stdin_content) = if cmd.starts_with("sudo ") && sudo_password.is_some() {
            let rest = &cmd[5..];
            let escaped = rest.replace('\'', "'\"'\"'");
            let run_cmd = format!("sudo -S sh -c '{}'", escaped);
            let pw = sudo_password.unwrap_or("");
            let stdin_content = format!("{}\n", pw);
            (run_cmd, Some(stdin_content))
        } else {
            (cmd.to_string(), None)
        };

        let (key_path, temp_key_path) = match (node.ssh_key_path.as_deref(), node.ssh_key_content.as_deref()) {
            (Some(p), _) if !p.is_empty() => (Some(p.to_string()), None),
            (_, Some(c)) if !c.is_empty() => {
                let mut path = std::env::temp_dir();
                path.push(format!("lightpup-ssh-{}.key", Uuid::new_v4()));
                if let Ok(mut f) = std::fs::File::create(&path) {
                    let _ = f.write_all(c.as_bytes());
                    let _ = f.sync_all();
                    drop(f);
                    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
                    let p = path.to_string_lossy().to_string();
                    (Some(p.clone()), Some(p))
                } else {
                    (None, None)
                }
            }
            _ => (None, None),
        };

        let mut ssh_cmd = StdCommand::new("ssh");
        ssh_cmd
            .arg("-o")
            .arg("StrictHostKeyChecking=no")
            .arg("-o")
            .arg("UserKnownHostsFile=/dev/null")
            .arg("-o")
            .arg("BatchMode=yes");
        if let Some(ref k) = key_path {
            ssh_cmd.arg("-i").arg(k);
        }
        ssh_cmd.arg(&ssh_target).arg(&remote_cmd);
        ssh_cmd.stdin(if stdin_content.is_some() {
            std::process::Stdio::piped()
        } else {
            std::process::Stdio::null()
        });
        let mut child = ssh_cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| crate::Error::Internal(format!("SSH failed: {}", e)))?;
        if let Some(stdin_str) = stdin_content {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(stdin_str.as_bytes());
                let _ = stdin.flush();
            }
        }
        let output = child.wait_with_output();
        if let Some(ref p) = temp_key_path {
            let _ = std::fs::remove_file(p);
        }
        let output = output
            .map_err(|e| crate::Error::Internal(format!("SSH failed: {}", e)))?;
        let out = String::from_utf8_lossy(&output.stdout).to_string();
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if err.is_empty() {
            out
        } else {
            format!("{}\n{}", out, err)
        };
        Ok(RunServerCommandResponse {
            output: combined,
            exit_code: output.status.code().unwrap_or(-1),
        })
    }
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
