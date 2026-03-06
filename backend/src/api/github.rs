use axum::{
    extract::{Path, State},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::api::error::ErrorResponse;
use crate::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/settings/github", get(github_settings).put(update_github_settings))
        .route("/api/github/repos", get(github_repos))
        .route("/api/github/webhook-url", get(webhook_url))
        .route("/api/github/repos/:owner/:repo/webhook", post(create_webhook).delete(delete_webhook))
}

#[derive(Serialize, Deserialize, Default)]
pub struct GithubSettings {
    pub token: Option<String>,
    pub webhook_secret: Option<String>,
    pub server_url: Option<String>,
}

async fn github_settings(State(state): State<AppState>) -> impl IntoResponse {
    let token = state.db.get_setting("github_token").await.ok().flatten();
    let webhook_secret = state.db.get_setting("github_webhook_secret").await.ok().flatten();
    let server_url = state.db.get_setting("github_server_url").await.ok().flatten();

    // Generate webhook secret if not exists
    let webhook_secret = if let Some(secret) = webhook_secret {
        secret
    } else {
        let secret = uuid::Uuid::new_v4().to_string();
        let _ = state.db.set_setting("github_webhook_secret", &secret).await;
        secret
    };

    Json(GithubSettings {
        token,
        webhook_secret: Some(webhook_secret),
        server_url,
    })
}

#[derive(Deserialize)]
pub struct UpdateGithubSettingsRequest {
    pub token: Option<String>,
    pub server_url: Option<String>,
}

async fn update_github_settings(
    State(state): State<AppState>,
    Json(payload): Json<UpdateGithubSettingsRequest>,
) -> impl IntoResponse {
    if let Some(token) = &payload.token {
        if !token.is_empty() {
            let _ = state.db.set_setting("github_token", token).await;
        }
    }
    if let Some(url) = &payload.server_url {
        let _ = state.db.set_setting("github_server_url", url).await;
    }

    github_settings(State(state)).await
}

#[derive(Deserialize, Serialize)]
struct GithubRepo {
    id: i64,
    name: String,
    full_name: String,
    html_url: String,
    #[serde(rename = "private")]
    private: bool,
    #[serde(rename = "default_branch")]
    default_branch: String,
}

#[derive(Serialize)]
struct GithubUserResponse {
    login: String,
    repos: Vec<GithubRepo>,
}

async fn github_repos(State(state): State<AppState>) -> impl IntoResponse {
    let token = match state.db.get_setting("github_token").await {
        Ok(Some(t)) if !t.is_empty() => t,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, Json(ErrorResponse::new("No GitHub token configured"))).into_response(),
    };

    // Get user
    let user_response = reqwest::Client::new()
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "lightpup")
        .send()
        .await;

    let user = match user_response {
        Ok(resp) if resp.status().is_success() => match resp.json::<serde_json::Value>().await {
            Ok(json) => json.get("login").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            Err(_) => "".to_string(),
        },
        _ => "".to_string(),
    };

    // Get repos
    let repos_response = reqwest::Client::new()
        .get("https://api.github.com/user/repos?per_page=100&sort=updated")
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "lightpup")
        .send()
        .await;

    let repos: Vec<GithubRepo> = match repos_response {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<Vec<GithubRepo>>().await {
                Ok(r) => r,
                Err(_) => Vec::new(),
            }
        }
        _ => Vec::new(),
    };

    Json(GithubUserResponse { login: user, repos }).into_response()
}

async fn webhook_url(State(state): State<AppState>) -> impl IntoResponse {
    let server_url = state.db.get_setting("github_server_url").await.ok().flatten();
    let webhook_secret = state.db.get_setting("github_webhook_secret").await.ok().flatten();

    let url = server_url.unwrap_or_default();
    let secret = webhook_secret.unwrap_or_default();

    Json(serde_json::json!({
        "url": format!("{}/api/webhooks/github", url),
        "secret": secret
    }))
}

#[derive(Serialize)]
struct WebhookResponse {
    success: bool,
    message: String,
}

async fn create_webhook(
    State(state): State<AppState>,
    Path((owner, repo)): Path<(String, String)>,
) -> impl IntoResponse {
    let token = match state.db.get_setting("github_token").await {
        Ok(Some(t)) if !t.is_empty() => t,
        _ => return (axum::http::StatusCode::BAD_REQUEST, Json(WebhookResponse { success: false, message: "No GitHub token configured".to_string() })).into_response(),
    };

    let server_url = state.db.get_setting("github_server_url").await.ok().flatten()
        .unwrap_or_else(|| "http://localhost:3000".to_string());
    let webhook_secret = state.db.get_setting("github_webhook_secret").await.ok().flatten()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let webhook_url = format!("{}/api/webhooks/github", server_url);

    let payload = serde_json::json!({
        "config": {
            "url": webhook_url,
            "content_type": "json",
            "secret": webhook_secret
        },
        "events": ["push"],
        "active": true
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&format!("https://api.github.com/repos/{}/{}/hooks", owner, repo))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "lightpup")
        .header("Accept", "application/vnd.github+json")
        .json(&payload)
        .send()
        .await;

    match response {
        Ok(resp) if resp.status().is_success() => {
            (axum::http::StatusCode::OK, Json(WebhookResponse { success: true, message: "Webhook created successfully".to_string() })).into_response()
        }
        Ok(resp) => {
            let error = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            (axum::http::StatusCode::BAD_REQUEST, Json(WebhookResponse { success: false, message: error })).into_response()
        }
        Err(e) => {
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(WebhookResponse { success: false, message: e.to_string() })).into_response()
        }
    }
}

async fn delete_webhook(
    State(state): State<AppState>,
    Path((owner, repo)): Path<(String, String)>,
) -> impl IntoResponse {
    let token = match state.db.get_setting("github_token").await {
        Ok(Some(t)) if !t.is_empty() => t,
        _ => return (axum::http::StatusCode::BAD_REQUEST, Json(WebhookResponse { success: false, message: "No GitHub token configured".to_string() })).into_response(),
    };

    // First get list of hooks to find the one we created
    let client = reqwest::Client::new();
    
    // List hooks to find LightPup webhook
    let list_response = client
        .get(&format!("https://api.github.com/repos/{}/{}/hooks", owner, repo))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "lightpup")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await;

    let hooks: Vec<serde_json::Value> = match list_response {
        Ok(resp) if resp.status().is_success() => resp.json().await.unwrap_or_default(),
        _ => Vec::new(),
    };

    // Find webhook by looking for our URL pattern
    let server_url = state.db.get_setting("github_server_url").await.ok().flatten()
        .unwrap_or_else(|| "http://localhost:3000".to_string());
    let webhook_url = format!("{}/api/webhooks/github", server_url);

    let mut found_hook_id: Option<i64> = None;
    for hook in hooks {
        if let Some(config) = hook.get("config") {
            if let Some(url) = config.get("url").and_then(|v| v.as_str()) {
                if url.contains("/api/webhooks/github") {
                    found_hook_id = hook.get("id").and_then(|v| v.as_i64());
                    break;
                }
            }
        }
    }

    if let Some(hook_id) = found_hook_id {
        let delete_response = client
            .delete(&format!("https://api.github.com/repos/{}/{}/hooks/{}", owner, repo, hook_id))
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "lightpup")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await;

        match delete_response {
            Ok(resp) if resp.status().is_success() => {
                (axum::http::StatusCode::OK, Json(WebhookResponse { success: true, message: "Webhook deleted".to_string() })).into_response()
            }
            Ok(resp) => {
                let error = resp.text().await.unwrap_or_else(|_| "Unknown error".to_string());
                (axum::http::StatusCode::BAD_REQUEST, Json(WebhookResponse { success: false, message: error })).into_response()
            }
            Err(e) => {
                (axum::http::StatusCode::INTERNAL_SERVER_ERROR, Json(WebhookResponse { success: false, message: e.to_string() })).into_response()
            }
        }
    } else {
        (axum::http::StatusCode::NOT_FOUND, Json(WebhookResponse { success: false, message: "No webhook found".to_string() })).into_response()
    }
}
