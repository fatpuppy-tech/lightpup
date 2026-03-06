//! Cron jobs API: list, create, update, delete scheduled jobs per application.

use crate::api::auth::CurrentUser;
use crate::api::error::error_response;
use crate::api::permissions::{require_can_mutate_project, require_can_view_project};
use crate::api::types::{CreateCronJobRequest, UpdateCronJobRequest};
use crate::db::ScheduledJob;
use crate::AppState;
use axum::{
    extract::{Path, State},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post},
    Json, Router,
};
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/applications/:id/cron-jobs", get(list_cron_jobs).post(create_cron_job))
        .route(
            "/api/cron-jobs/:id",
            get(get_cron_job)
                .patch(update_cron_job)
                .delete(delete_cron_job),
        )
}

async fn list_cron_jobs(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(application_id): Path<String>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&application_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_view_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.get_scheduled_jobs_by_application(&application_id).await {
        Ok(jobs) => Json(jobs).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn create_cron_job(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(application_id): Path<String>,
    Json(payload): Json<CreateCronJobRequest>,
) -> Response {
    let project_id = match state.db.get_project_id_for_application(&application_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
        Err(e) => return error_response(&e).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    if payload.name.trim().is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Name is required" })),
        )
            .into_response();
    }
    if payload.cron_expression.trim().is_empty() {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Cron expression is required" })),
        )
            .into_response();
    }
    if state.db.get_application(&application_id).await.is_err() {
        return (
            axum::http::StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Application not found" })),
        )
            .into_response();
    }
    let id = Uuid::new_v4().to_string();
    match state
        .db
        .create_scheduled_job(
            &id,
            &application_id,
            payload.name.trim(),
            payload.cron_expression.trim(),
        )
        .await
    {
        Ok(()) => match state.db.get_scheduled_job(&id).await {
            Ok(job) => Json(job).into_response(),
            Err(e) => error_response(&e).into_response(),
        },
        Err(e) => error_response(&e).into_response(),
    }
}

async fn get_cron_job(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.db.get_scheduled_job(&id).await {
        Ok(job) => Json(job).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}

async fn update_cron_job(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
    Json(payload): Json<UpdateCronJobRequest>,
) -> Response {
    let job = match state.db.get_scheduled_job(&id).await {
        Ok(j) => j,
        Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Cron job not found" }))).into_response(),
    };
    let project_id = match state.db.get_project_id_for_application(&job.application_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) | Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    let name = payload.name.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let cron_expression = payload
        .cron_expression
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let enabled = payload.enabled;
    match state
        .db
        .update_scheduled_job(&id, name, cron_expression, enabled)
        .await
    {
        Ok(()) => match state.db.get_scheduled_job(&id).await {
            Ok(job) => Json(job).into_response(),
            Err(e) => error_response(&e).into_response(),
        },
        Err(e) => error_response(&e).into_response(),
    }
}

async fn delete_cron_job(
    State(state): State<AppState>,
    current_user: CurrentUser,
    Path(id): Path<String>,
) -> Response {
    let job = match state.db.get_scheduled_job(&id).await {
        Ok(j) => j,
        Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Cron job not found" }))).into_response(),
    };
    let project_id = match state.db.get_project_id_for_application(&job.application_id).await {
        Ok(Some(pid)) => pid,
        Ok(None) | Err(_) => return (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Application not found" }))).into_response(),
    };
    if let Err(resp) = require_can_mutate_project(&state, &current_user, &project_id).await {
        return resp;
    }
    match state.db.delete_scheduled_job(&id).await {
        Ok(()) => (axum::http::StatusCode::NO_CONTENT, ()).into_response(),
        Err(e) => error_response(&e).into_response(),
    }
}
