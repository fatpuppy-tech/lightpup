//! Proxy app list API.

use crate::api::error::error_response;
use crate::api::types::ProxyAppSummary;
use crate::AppState;
use axum::{
    extract::State,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/proxy/apps", get(list_proxy_apps))
}

async fn list_proxy_apps(State(state): State<AppState>) -> Response {
    let rows = match state.db.get_proxy_apps().await {
        Ok(r) => r,
        Err(e) => return error_response(&e).into_response(),
    };
    let apps: Vec<ProxyAppSummary> = rows
        .into_iter()
        .map(|r| ProxyAppSummary {
            id: r.id,
            name: r.name,
            domain: r.domain,
            port: r.port as u16,
            status: r.status,
            environment_name: r.environment_name,
            project_name: r.project_name,
        })
        .collect();
    Json(apps).into_response()
}
