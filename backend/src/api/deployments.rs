//! Deployments list and get API.

use crate::api::error::error_response;
use crate::api::types::DashboardDeployment;
use crate::AppState;
use axum::{
    extract::{Path, Query, State},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

const DEFAULT_LIMIT: u32 = 20;
const MAX_LIMIT: u32 = 100;

#[derive(Debug, Deserialize)]
struct ListDeploymentsQuery {
    limit: Option<u32>,
    offset: Option<u32>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/applications/:id/deployments", get(list_deployments))
        .route("/api/deployments/recent", get(list_recent_deployments))
        .route("/api/deployments/:id", get(get_deployment))
}

async fn list_deployments(
    State(state): State<AppState>,
    Path(app_id): Path<String>,
    Query(q): Query<ListDeploymentsQuery>,
) -> Response {
    let limit = q.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);
    let offset = q.offset.unwrap_or(0);
    match state
        .db
        .get_deployments_paginated(&app_id, limit, offset)
        .await
    {
        Ok(deploys) => Json(deploys).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn list_recent_deployments(State(state): State<AppState>) -> Response {
    match state.db.get_recent_deployments_with_app(20).await {
        Ok(pairs) => {
            let deploys: Vec<DashboardDeployment> = pairs
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
                .collect();
            Json(deploys).into_response()
        }
        Err(e) => error_response(&e).into_response(),
    }
}

async fn get_deployment(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    match state.db.get_deployment(&id).await {
        Ok(deploy) => Json(deploy).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}
