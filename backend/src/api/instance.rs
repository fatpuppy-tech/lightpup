//! Instance info API.

use axum::{
    extract::State,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Serialize;

use crate::AppState;

#[derive(Serialize)]
struct InstanceInfo {
    version: String,
    docker_available: bool,
    data_dir: String,
}

#[derive(Serialize)]
pub struct OnboardingStatus {
    needs_onboarding: bool,
    server_count: i64,
    project_count: i64,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/instance", get(instance_info))
        .route("/api/onboarding", get(onboarding_status))
}

async fn instance_info() -> Response {
    let data_dir = directories::ProjectDirs::from("com", "lightpup", "lightpup")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| std::env::current_dir().unwrap().join("data"));

    let info = InstanceInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        docker_available: true,
        data_dir: data_dir.display().to_string(),
    };

    Json(info).into_response()
}

async fn onboarding_status(State(state): State<AppState>) -> Response {
    let server_count = state.db.get_nodes().await.map(|n| n.len() as i64).unwrap_or(0);
    let project_count = state.db.get_projects().await.map(|p| p.len() as i64).unwrap_or(0);
    
    let needs_onboarding = server_count == 0 && project_count == 0;
    
    Json(OnboardingStatus {
        needs_onboarding,
        server_count,
        project_count,
    }).into_response()
}
