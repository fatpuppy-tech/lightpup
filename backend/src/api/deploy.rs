//! Deployment: create deployment record and run build/run logic (local or remote).
//! Local deploys use blue-green: new container on staging slot, health check, then swap.
//! Cron jobs: run_cron_loop checks scheduled_jobs and triggers deploy on schedule.

use crate::api::auth::CurrentUser;
use crate::api::permissions::require_can_mutate_project;
use crate::api::error::{error_response, ErrorResponse};
use crate::api::types::{DeployRequest, ReleaseRequest};
use crate::db::{Application, Deployment};
use crate::docker;
use crate::AppState;
use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use chrono::Utc;
use cron::Schedule;
use std::str::FromStr;
use std::time::Duration;
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

/// Run HTTP GET to health path with timeout; retries up to 3 times with 1s delay.
pub(crate) async fn health_check(
    port: u16,
    path: &str,
    timeout_secs: u64,
    logs: &mut String,
) -> bool {
    let path = path.trim_start_matches('/');
    let url = format!("http://127.0.0.1:{}/{}", port, path);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build();
    let client = match client {
        Ok(c) => c,
        Err(e) => {
            log_with_timestamp(logs, &format!("Health check client error: {}", e));
            return false;
        }
    };
    for attempt in 1..=3 {
        log_with_timestamp(logs, &format!("Health check attempt {}: GET {}", attempt, url));
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                log_with_timestamp(logs, "Health check passed.");
                return true;
            }
            Ok(resp) => {
                log_with_timestamp(logs, &format!("Health check returned status: {}", resp.status()));
            }
            Err(e) => {
                log_with_timestamp(logs, &format!("Health check error: {}", e));
            }
        }
        if attempt < 3 {
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }
    false
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/applications/:id/deploy", post(deploy_application))
        .route("/api/applications/:id/release", post(release_application))
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
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<DeployRequest>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return (axum::http::StatusCode::NOT_FOUND, Json(ErrorResponse::new("Application not found"))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match create_and_run_deployment(state, id, payload.version).await {
        Ok(deploy) => Json(deploy).into_response(),
        Err((code, msg)) => (code, Json(ErrorResponse::new(msg))).into_response(),
    }
}

async fn release_application(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(app_id): Path<String>,
    Json(payload): Json<ReleaseRequest>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&app_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return (axum::http::StatusCode::NOT_FOUND, Json(ErrorResponse::new("Application not found"))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    let app = match state.db.get_application(&app_id).await {
        Ok(a) => a,
        Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(ErrorResponse::new("Application not found"))).into_response(),
    };
    let deployment = match state.db.get_deployment(&payload.deployment_id).await {
        Ok(d) => d,
        Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(ErrorResponse::new("Deployment not found"))).into_response(),
    };
    if deployment.application_id != app_id {
        return (axum::http::StatusCode::BAD_REQUEST, Json(ErrorResponse::new("Deployment does not belong to this application"))).into_response();
    }
    let server = if let Some(ref node_id) = app.node_id {
        state.db.get_node(node_id).await.ok()
    } else {
        state.db.get_nodes().await.ok().and_then(|nodes| nodes.into_iter().find(|n| n.is_active))
    };
    if let Some(server) = server {
        let addr = server.address.trim();
        let is_ssh = server.ssh_user.is_some() || addr.starts_with("ssh ") || addr.contains('@');
        if is_ssh {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new("Release is only supported for local Docker. Use Deploy with this version to redeploy on a remote server.")),
            )
                .into_response();
        }
    }
    let sanitized = deployment
        .version
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>();
    let image_tag = format!("lightpup-{}:{}", app.id, sanitized);
    if state.docker.is_none() {
        return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse::new("Docker not available.")),
        )
            .into_response();
    }
    let docker = state
        .docker
        .as_ref()
        .as_ref()
        .expect("docker already checked above");
    let mut logs = String::new();
    log_with_timestamp(&mut logs, &format!("Releasing version {} (image: {})", deployment.version, image_tag));
    match run_local_blue_green(
        &state,
        docker,
        &app,
        &image_tag,
        Some(&payload.deployment_id),
        None,
        &mut logs,
    )
    .await
    {
        Ok(()) => (
            axum::http::StatusCode::OK,
            Json(serde_json::json!({ "ok": true, "message": "Release completed", "logs": logs })),
        )
            .into_response(),
        Err(()) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse::new(&logs)),
        )
            .into_response(),
    }
}

/// Start container on staging slot, health check, swap live_slot, stop old container.
/// live_deployment_id: set on app when swapping (for UI). update_deployment_id: if Some, update that deployment's status on success/failure.
async fn run_local_blue_green(
    state: &AppState,
    docker: &docker::DockerManager,
    app: &Application,
    image_tag: &str,
    live_deployment_id: Option<&str>,
    update_deployment_id: Option<&str>,
    logs: &mut String,
) -> Result<(), ()> {
    let container_port = 80u16;
    let (staging_slot, staging_port, staging_container_name) = if app.live_slot == "secondary" {
        ("primary", app.port, format!("lightpup-{}-primary", app.id))
    } else {
        (
            "secondary",
            app.port_staging,
            format!("lightpup-{}-secondary", app.id),
        )
    };
    let old_container_name = if app.live_slot == "secondary" {
        format!("lightpup-{}-secondary", app.id)
    } else {
        format!("lightpup-{}-primary", app.id)
    };

    log_with_timestamp(logs, &format!("Blue-green: deploying to {} slot on port {}", staging_slot, staging_port));
    let deploy_env = state.db.get_deploy_env(&app.id).await.unwrap_or_default();
    if !deploy_env.is_empty() {
        log_with_timestamp(logs, &format!("Injecting {} env var(s) into container", deploy_env.len()));
    }
    log_with_timestamp(logs, &format!("Creating and starting container: {}", staging_container_name));

    if let Err(e) = docker
        .create_and_start_container_with_env(
            &staging_container_name,
            image_tag,
            staging_port,
            container_port,
            &deploy_env,
        )
        .await
    {
        log_with_timestamp(logs, &format!("Error: {}", e));
        if let Some(id) = update_deployment_id {
            let _ = state.db.update_deployment_status(id, "failed", Some(logs)).await;
        }
        return Err(());
    }

    log_with_timestamp(logs, "Container started; running health check...");
    let health_path = app.health_path.as_deref().unwrap_or("health");
    let timeout_secs = app.health_timeout_secs.unwrap_or(5) as u64;
    if !health_check(staging_port, health_path, timeout_secs, logs).await {
        log_with_timestamp(logs, "Health check failed; removing staging container.");
        let _ = docker.stop_container(&staging_container_name).await;
        let _ = docker.remove_container(&staging_container_name).await;
        if let Some(id) = update_deployment_id {
            let _ = state.db.update_deployment_status(id, "failed", Some(logs)).await;
        }
        return Err(());
    }

    log_with_timestamp(logs, &format!("Swapping live slot to {}", staging_slot));
    if let Err(e) = state
        .db
        .set_live_slot(&app.id, staging_slot, live_deployment_id)
        .await
    {
        log_with_timestamp(logs, &format!("Failed to update live_slot: {}", e));
        let _ = docker.stop_container(&staging_container_name).await;
        let _ = docker.remove_container(&staging_container_name).await;
        if let Some(id) = update_deployment_id {
            let _ = state.db.update_deployment_status(id, "failed", Some(logs)).await;
        }
        return Err(());
    }

    log_with_timestamp(logs, &format!("Stopping previous container: {}", old_container_name));
    let _ = docker.stop_container(&old_container_name).await;
    let _ = docker.remove_container(&old_container_name).await;
    let _ = state.db.set_application_status(&app.id, "running").await;
    log_with_timestamp(logs, "Deployment completed successfully!");
    if let Some(id) = update_deployment_id {
        let _ = state.db.update_deployment_status(id, "success", Some(logs)).await;
    }
    Ok(())
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
                match build_image_from_repo(&state, &deploy_id, &app, &version, &mut logs, None).await {
                    Some(tag) => tag,
                    None => {
                        let _ = state.db.update_deployment_status(&deploy_id, "failed", Some(&logs)).await;
                        return;
                    }
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
        log_with_timestamp(&mut logs, "Deployment target: local Docker (blue-green)");
        let _ = run_local_blue_green(
            &state,
            docker,
            &app,
            &built_image,
            Some(&deploy_id),
            Some(&deploy_id),
            &mut logs,
        )
        .await;
    } else {
        log_with_timestamp(&mut logs, "Docker not available. Please ensure Docker is running.");
        log_with_timestamp(&mut logs, "Deployment skipped.");
        let _ = state.db.update_deployment_status(&deploy_id, "failed", Some(&logs)).await;
    }
}

/// Builds a Docker image from the app's repo. If `branch_override` is Some, that branch is
/// used for the clone instead of the app's repo_branch. Returns the image tag on success.
pub(crate) async fn build_image_from_repo(
    state: &AppState,
    build_id: &str,
    app: &Application,
    version: &str,
    logs: &mut String,
    branch_override: Option<&str>,
) -> Option<String> {
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;

    let repo_url = app.repo_url.as_ref()?;
    let branch = branch_override
        .map(String::from)
        .unwrap_or_else(|| app.repo_branch.clone().unwrap_or_else(|| "main".to_string()));
    let dockerfile_path = app
        .dockerfile_path
        .clone()
        .unwrap_or_else(|| "Dockerfile".to_string());

    log_with_timestamp(logs, &format!("Repository configured: {} (branch: {})", repo_url, branch));

    let base_dir = std::env::temp_dir().join("lightpup-builds");
    let build_dir: PathBuf = base_dir.join(&app.id).join(build_id);

    if let Err(e) = fs::create_dir_all(&build_dir) {
        log_with_timestamp(logs, &format!("Failed to create build dir: {}", e));
        log_with_timestamp(logs, "Build failed!");
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
            log_with_timestamp(logs, "Build failed!");
            return None;
        }
        Err(e) => {
            log_with_timestamp(logs, &format!("Git clone error: {}", e));
            log_with_timestamp(logs, "Build failed!");
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
            log_with_timestamp(logs, "Build failed!");
            None
        }
        Err(join_err) => {
            log_with_timestamp(logs, &format!("Docker build join error: {}", join_err));
            log_with_timestamp(logs, "Build failed!");
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
    let deploy_env = state.db.get_deploy_env(&app.id).await.unwrap_or_default();
    if !deploy_env.is_empty() {
        log_with_timestamp(logs, &format!("Injecting {} env var(s) into remote container", deploy_env.len()));
    }
    log_with_timestamp(logs, &format!("Host port: {} -> Container port: {}", host_port, container_port));
    log_with_timestamp(logs, &format!("Pulling and starting container with image: {}", built_image));
    let env_args: String = deploy_env
        .iter()
        .map(|s| {
            let escaped = s.replace('\'', "'\"'\"'");
            format!(" -e '{}'", escaped)
        })
        .collect();
    let remote_cmd = format!(
        "docker pull {image} && (docker rm -f {name} >/dev/null 2>&1 || true) && docker run -d --name {name} -p {host_port}:{container_port}{env_args} {image}",
        image = built_image,
        name = container_name,
        host_port = host_port,
        container_port = container_port,
        env_args = env_args
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

/// Convert 5-field cron (min hour day month dow) to 7-field (sec min hour day month dow year) for the cron crate.
fn normalize_cron_expression(expr: &str) -> String {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() == 5 {
        format!("0 {} *", expr.trim()) // prepend "0 " (sec), append " *" (year)
    } else {
        expr.to_string()
    }
}

/// Background loop: every minute (on the minute boundary), check enabled cron jobs and trigger deploy if due.
pub async fn run_cron_loop(state: AppState) {
    // Align to the next minute boundary so "upcoming(Utc).next()" matches the current minute when due.
    let now = Utc::now();
    let secs = now.timestamp() % 60;
    let sleep_secs = if secs == 0 { 60 } else { 60 - secs };
    tokio::time::sleep(Duration::from_secs(sleep_secs as u64)).await;

    let mut interval = tokio::time::interval(Duration::from_secs(60));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        let jobs = match state.db.get_enabled_scheduled_jobs().await {
            Ok(j) => j,
            Err(e) => {
                tracing::warn!("Cron: failed to load jobs: {}", e);
                continue;
            }
        };
        let now = Utc::now();
        for job in jobs {
            let expr_7 = normalize_cron_expression(&job.cron_expression);
            let schedule = match Schedule::from_str(&expr_7) {
                Ok(s) => s,
                Err(e) => {
                    tracing::warn!("Cron: invalid expression for job {}: {}", job.id, e);
                    continue;
                }
            };
            let next = match schedule.upcoming(Utc).next() {
                Some(t) => t,
                None => continue,
            };
            let run_due = next <= now + chrono::Duration::seconds(90);
            let not_run_recently = job
                .last_run_at
                .as_ref()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|t| t.with_timezone(&Utc) < next)
                .unwrap_or(true);
            if run_due && not_run_recently {
                let state_deploy = state.clone();
                let state_update = state.clone();
                let job_id = job.id.clone();
                let app_id = job.application_id.clone();
                let version = format!("scheduled-{}", now.format("%Y%m%d-%H%M%S"));
                tokio::spawn(async move {
                    tracing::info!("Cron: triggering deploy for job {} (app {})", job_id, app_id);
                    match create_and_run_deployment(state_deploy, app_id, version).await {
                        Ok(_) => {
                            let _ = state_update
                                .db
                                .set_scheduled_job_last_run(&job_id, &Utc::now().to_rfc3339())
                                .await;
                        }
                        Err((code, msg)) => {
                            tracing::warn!("Cron: deploy failed for job {}: {} {}", job_id, code, msg);
                        }
                    }
                });
            }
        }
    }
}
