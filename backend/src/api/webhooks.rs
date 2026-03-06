//! Incoming webhooks (e.g. GitHub push).

use crate::api::deploy;
use crate::api::error::{internal_error, ErrorResponse};
use crate::AppState;
use axum::{
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
    routing::post,
    Json, Router,
};
use axum::body::Bytes;
use serde::Deserialize;

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/webhooks/github", post(github_webhook))
}

#[derive(Deserialize)]
struct GithubPushRepository {
    full_name: String,
}

#[derive(Deserialize)]
struct GithubPushPayload {
    #[serde(rename = "ref")]
    git_ref: String,
    repository: GithubPushRepository,
}

async fn github_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    let event = headers
        .get("X-GitHub-Event")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if event != "push" {
        return (axum::http::StatusCode::OK, "").into_response();
    }

    if let (Some(sig_header), Ok(secret)) = (
        headers.get("X-Hub-Signature-256"),
        std::env::var("GITHUB_WEBHOOK_SECRET"),
    ) {
        if let Ok(sig_str) = sig_header.to_str() {
            let expected_prefix = "sha256=";
            if sig_str.starts_with(expected_prefix) {
                let sig_hex = &sig_str[expected_prefix.len()..];
                let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
                mac.update(&body);
                let result = mac.finalize();
                let computed = result.into_bytes();
                let computed_hex = computed
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<String>();

                if !constant_time_eq::constant_time_eq(computed_hex.as_bytes(), sig_hex.as_bytes())
                {
                    return (
                        axum::http::StatusCode::UNAUTHORIZED,
                        Json(ErrorResponse::new("invalid signature")),
                    )
                        .into_response();
                }
            }
        }
    }

    let payload: GithubPushPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                Json(ErrorResponse::new(format!("invalid payload: {}", e))),
            )
                .into_response()
        }
    };

    let branch = payload
        .git_ref
        .rsplit('/')
        .next()
        .unwrap_or("")
        .to_string();
    let repo_full_name = payload.repository.full_name;

    let matched_app_ids = match state.db.find_app_ids_by_repo(&repo_full_name, &branch).await {
        Ok(ids) => ids,
        Err(e) => return internal_error(e.to_string()).into_response(),
    };

    for app_id in matched_app_ids {
        let state_clone = state.clone();
        let id_clone = app_id.clone();
        tokio::spawn(async move {
            let _ = deploy::create_and_run_deployment(
                state_clone,
                id_clone,
                "latest".to_string(),
            )
            .await;
        });
    }

    Json(serde_json::json!({ "received": true })).into_response()
}
