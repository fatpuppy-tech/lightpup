//! Deployment: create deployment record and run build/run logic (local or remote).

use crate::api::error::ErrorResponse;
use crate::api::types::DeployRequest;
use crate::db::{Application, Deployment};
use crate::docker;
use crate::AppState;
use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use std::time::Instant;
use uuid::Uuid;

fn timestamp() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let hours = (secs / 3600) % 24;
    let mins = (secs / 60) % 60;
    let secs = secs % 60;
    format!("{:02}:{:02}:{:02}", hours, mins, secs)
}

fn log_with_timestamp(logs: &mut String, message: &str) {
    logs.push_str(&format!("[{}] {}\n", timestamp(), message));
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/applications/:id/deploy", post(deploy_application))
}

/// Called by the HTTP handler and by the GitHub webhook. Creates a deployment record,
/// spawns the actual work in the background, and returns the deployment row.
pub async fn create_and_run_deployment(
    state: AppState,
    app_id: String,
    version: String,
) -> Result<Deployment, (axum::http::StatusCode, String)> {
    let deploy_id = Uuid::new_v4().to_string();

    state
        .db
        .create_deployment(&deploy_id, &app_id, &version)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    state
        .db
        .update_deployment_status(
            &deploy_id,
            "running",
            Some(&format!("[{}] Starting deployment of {}", timestamp(), version)),
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let app = match state.db.get_application(&app_id).await {
        Ok(a) => a,
        Err(e) => {
            let _ = state
                .db
                .update_deployment_status(
                    &deploy_id,
                    "failed",
                    Some(&format!("Application not found: {}", e)),
                )
                .await;
            return Err((
                axum::http::StatusCode::NOT_FOUND,
                "Application not found".to_string(),
            ));
        }
    };

    let state_clone = state.clone();
    let deploy_id_clone = deploy_id.clone();
    let app_clone = app.clone();
    let version_clone = version.clone();
    tokio::spawn(async move {
        run_deployment_impl(state_clone, deploy_id_clone, app_clone, version_clone).await;
    });

    state
        .db
        .get_deployment(&deploy_id)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn deploy_application(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<DeployRequest>,
) -> Response {
    match create_and_run_deployment(state, id, payload.version).await {
        Ok(deploy) => Json(deploy).into_response(),
        Err((code, msg)) => (code, Json(ErrorResponse::new(msg))).into_response(),
    }
}

async fn run_deployment_impl(
    state: AppState,
    deploy_id: String,
    app: Application,
    version: String,
) {
    let start_time = Instant::now();
    let mut logs = String::new();
    log_with_timestamp(&mut logs, &format!("Starting deployment of {}:{} (build_type={})", app.image, version, app.build_type));

    let built_image = match app.build_type.as_str() {
        "docker" => {
            if app.repo_url.is_some() {
                match build_image_from_repo(&state, &deploy_id, &app, &version, &mut logs).await {
                    Some(tag) => tag,
                    None => return,
                }
            } else {
                format!("{}:{}", app.image, version)
            }
        }
        // For now, Compose and Railpack reuse the same image path; more advanced
        // orchestration can be added later.
        "docker_compose" | "railpack" | "static" | _ => {
            format!("{}:{}", app.image, version)
        }
    };

    // Resolve target server: app's assigned node_id, or first active node, or local.
    let server = if let Some(ref node_id) = app.node_id {
        state.db.get_node(node_id).await.ok()
    } else {
        state
            .db
            .get_nodes()
            .await
            .ok()
            .and_then(|nodes| nodes.into_iter().find(|n| n.is_active))
    };
    if let Some(server) = server {
        let addr = server.address.trim();
        let is_ssh = server.ssh_user.is_some() || addr.starts_with("ssh ") || addr.contains('@');
        if is_ssh {
            run_remote_deploy(&state, &deploy_id, &app, &built_image, &server, &mut logs).await;
            return;
        }
    }

    if let Some(ref docker) = *state.docker {
        let container_port = 80;
        let container_name = format!(
            "lightpup-{}",
            app.name.replace(' ', "-").to_lowercase()
        );

        log_with_timestamp(&mut logs, &format!("Host port: {} -> Container port: {}", app.port, container_port));
        log_with_timestamp(&mut logs, &format!("Creating and starting container: {}", container_name));

        match docker.create_and_start_container(
            &container_name,
            &built_image,
            app.port,
            container_port,
        ).await {
            Ok(container_id) => {
                log_with_timestamp(&mut logs, &format!("Container {} started successfully", container_id));
                let duration = start_time.elapsed();
                log_with_timestamp(&mut logs, &format!("Deployment completed successfully! (Duration: {:.1}s)", duration.as_secs_f64()));
                let _ = state.db.update_deployment_status(&deploy_id, "success", Some(&logs)).await;
                let _ = state.db.set_application_status(&app.id, "running").await;
            }
            Err(e) => {
                log_with_timestamp(&mut logs, &format!("Error: {}", e));
                let duration = start_time.elapsed();
                log_with_timestamp(&mut logs, &format!("Deployment failed! (Duration: {:.1}s)", duration.as_secs_f64()));
                let _ = state.db.update_deployment_status(&deploy_id, "failed", Some(&logs)).await;
            }
        }
    } else {
        log_with_timestamp(&mut logs, "Docker not available. Please ensure Docker is running.");
        log_with_timestamp(&mut logs, "Deployment skipped.");
        let _ = state.db.update_deployment_status(&deploy_id, "failed", Some(&logs)).await;
    }
}

async fn build_image_from_repo(
    state: &AppState,
    deploy_id: &str,
    app: &Application,
    version: &str,
    logs: &mut String,
) -> Option<String> {
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;

    let repo_url = app.repo_url.as_ref()?;
    let branch = app
        .repo_branch
        .clone()
        .unwrap_or_else(|| "main".to_string());
    let dockerfile_path = app
        .dockerfile_path
        .clone()
        .unwrap_or_else(|| "Dockerfile".to_string());

    log_with_timestamp(logs, &format!("Repository configured: {} (branch: {})", repo_url, branch));

    let base_dir = std::env::temp_dir().join("lightpup-builds");
    let build_dir: PathBuf = base_dir.join(&app.id).join(deploy_id);

    if let Err(e) = fs::create_dir_all(&build_dir) {
        log_with_timestamp(logs, &format!("Failed to create build dir: {}", e));
        log_with_timestamp(logs, "Deployment failed!");
        let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
        return None;
    }

    let token = state
        .db
        .get_setting("github_token")
        .await
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("GITHUB_TOKEN").ok());
    let mut clone_url = repo_url.clone();
    if let Some(token) = token {
        if repo_url.starts_with("https://github.com/") && !repo_url.contains('@') {
            let suffix = repo_url.trim_start_matches("https://github.com/");
            clone_url = format!("https://{}:x-oauth-basic@github.com/{}", token, suffix);
            log_with_timestamp(logs, "Using GitHub token for authenticated clone");
        }
    }

    log_with_timestamp(logs, &format!("Cloning repo {} (branch {}) into {:?}", clone_url, branch, build_dir));

    let git_status = Command::new("git")
        .arg("clone")
        .arg("--depth")
        .arg("1")
        .arg("--branch")
        .arg(&branch)
        .arg(&clone_url)
        .arg(".")
        .current_dir(&build_dir)
        .status();

    match git_status {
        Ok(status) if status.success() => log_with_timestamp(logs, "Git clone completed successfully"),
        Ok(status) => {
            log_with_timestamp(logs, &format!("Git clone failed with status: {:?}", status.code()));
            log_with_timestamp(logs, "Deployment failed!");
            let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
            return None;
        }
        Err(e) => {
            log_with_timestamp(logs, &format!("Git clone error: {}", e));
            log_with_timestamp(logs, "Deployment failed!");
            let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
            return None;
        }
    }

    let sanitized_version = version
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let image_tag = format!("lightpup-{}:{}", app.id, sanitized_version);

    log_with_timestamp(logs, &format!("Building Docker image {} using Dockerfile at {}", image_tag, dockerfile_path));

    let build_dir2 = build_dir.clone();
    let dockerfile_path2 = dockerfile_path.clone();
    let image_tag2 = image_tag.clone();
    let build_result = tokio::task::spawn_blocking(move || {
        let status = Command::new("docker")
            .arg("build")
            .arg("-t")
            .arg(&image_tag2)
            .arg("-f")
            .arg(&dockerfile_path2)
            .arg(".")
            .current_dir(&build_dir2)
            .status();
        match status {
            Ok(s) if s.success() => Ok(image_tag2),
            Ok(s) => Err(format!("docker build failed with code {:?}", s.code())),
            Err(e) => Err(format!("docker build error: {}", e)),
        }
    })
    .await;

    match build_result {
        Ok(Ok(tag)) => {
            log_with_timestamp(logs, &format!("Docker image built successfully: {}", tag));
            Some(tag)
        }
        Ok(Err(e)) => {
            log_with_timestamp(logs, &format!("Docker build error: {}", e));
            log_with_timestamp(logs, "Deployment failed!");
            let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
            None
        }
        Err(join_err) => {
            log_with_timestamp(logs, &format!("Docker build join error: {}", join_err));
            log_with_timestamp(logs, "Deployment failed!");
            let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
            None
        }
    }
}

async fn run_remote_deploy(
    state: &AppState,
    deploy_id: &str,
    app: &Application,
    built_image: &str,
    server: &crate::db::Node,
    logs: &mut String,
) {
    use std::process::Command;

    let addr = server.address.trim();
    let host = addr.strip_prefix("ssh ").unwrap_or(addr).trim();
    let ssh_target = if let Some(user) = server.ssh_user.as_deref() {
        format!("{user}@{host}")
    } else {
        host.to_string()
    };

    log_with_timestamp(logs, &format!("Using remote server {} via ssh {}", server.name, ssh_target));

    let container_name = format!(
        "lightpup-{}",
        app.name.replace(' ', "-").to_lowercase()
    );
    let host_port = app.port;
    let container_port = 80;
    log_with_timestamp(logs, &format!("Host port: {} -> Container port: {}", host_port, container_port));
    log_with_timestamp(logs, &format!("Pulling and starting container with image: {}", built_image));
    let remote_cmd = format!(
        "docker pull {image} && (docker rm -f {name} >/dev/null 2>&1 || true) && docker run -d --name {name} -p {host_port}:{container_port} {image}",
        image = built_image,
        name = container_name,
        host_port = host_port,
        container_port = container_port
    );

    let ssh_key_path = server.ssh_key_path.clone();
    let ssh_result = tokio::task::spawn_blocking(move || {
        let mut cmd = Command::new("ssh");
        if let Some(key_path) = ssh_key_path.as_deref() {
            cmd.arg("-i").arg(key_path);
        }
        cmd.arg(ssh_target).arg(remote_cmd).status()
    })
    .await;

    match ssh_result {
        Ok(Ok(status)) if status.success() => {
            log_with_timestamp(logs, "Remote Docker command completed successfully");
            log_with_timestamp(logs, "Deployment completed successfully on remote server!");
            let _ = state.db.update_deployment_status(deploy_id, "success", Some(logs)).await;
        }
        Ok(Ok(status)) => {
            log_with_timestamp(logs, &format!("Remote Docker command failed with status {:?}", status.code()));
            log_with_timestamp(logs, "Deployment failed!");
            let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
        }
        Ok(Err(e)) => {
            log_with_timestamp(logs, &format!("ssh error: {}", e));
            log_with_timestamp(logs, "Deployment failed!");
            let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
        }
        Err(join_err) => {
            log_with_timestamp(logs, &format!("ssh join error: {}", join_err));
            log_with_timestamp(logs, "Deployment failed!");
            let _ = state.db.update_deployment_status(deploy_id, "failed", Some(logs)).await;
        }
    }
}
