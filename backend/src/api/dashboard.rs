//! Dashboard summary API.

use crate::api::error::error_response;
use crate::api::types::{DashboardDeployment, DashboardResponse};
use crate::AppState;
use axum::{
    extract::State,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/dashboard", get(dashboard))
}

async fn dashboard(State(state): State<AppState>) -> Response {
    let (project_count, environment_count, application_count, running_app_count, deployment_count) =
        match state.db.get_dashboard_counts().await {
            Ok(c) => c,
            Err(e) => return error_response(&e).into_response(),
        };

    let recent = match state.db.get_recent_deployments_with_app(10).await {
        Ok(pairs) => pairs
            .into_iter()
            .map(|(d, app_name, app_domain)| DashboardDeployment {
                id: d.id,
                application_id: d.application_id,
                application_name: app_name,
                application_domain: app_domain,
                version: d.version,
                status: d.status,
                started_at: d.started_at,
                finished_at: d.finished_at,
            })
            .collect(),
        Err(e) => return error_response(&e).into_response(),
    };

    let payload = DashboardResponse {
        project_count,
        environment_count,
        application_count,
        running_app_count,
        deployment_count,
        recent_deployments: recent,
    };
    Json(payload).into_response()
}
