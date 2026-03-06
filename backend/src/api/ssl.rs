use crate::api::error::ErrorResponse;
use crate::api::types::{ProvisionRequest, UploadCertificateRequest};
use crate::tls::CertificateInfo;
use crate::AppState;
use axum::{
    extract::State,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/ssl/provision", post(provision_certificate))
        .route("/api/ssl/upload", post(upload_certificate))
        .route("/api/ssl/info/:domain", get(get_certificate_info))
        .route("/api/ssl/delete/:domain", delete(delete_certificate))
        .route("/api/ssl/list", get(list_certificates))
}

async fn provision_certificate(
    State(state): State<AppState>,
    Json(payload): Json<ProvisionRequest>,
) -> Response {
    let domain = payload.domain.trim();
    if domain.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(ErrorResponse::new("Domain is required".to_string()))).into_response();
    }

    match state.tls.provision_certificate(domain, payload.email.as_deref()).await {
        Ok(info) => Json(info).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse::new(e.to_string())),
        ).into_response(),
    }
}

async fn upload_certificate(
    State(state): State<AppState>,
    Json(payload): Json<UploadCertificateRequest>,
) -> Response {
    let domain = payload.domain.trim();
    if domain.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(ErrorResponse::new("Domain is required".to_string()))).into_response();
    }
    
    if payload.cert_pem.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(ErrorResponse::new("Certificate is required".to_string()))).into_response();
    }
    
    if payload.key_pem.is_empty() {
        return (axum::http::StatusCode::BAD_REQUEST, Json(ErrorResponse::new("Private key is required".to_string()))).into_response();
    }

    match state.tls.upload_certificate(domain, &payload.cert_pem, &payload.key_pem).await {
        Ok(info) => Json(info).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse::new(e.to_string())),
        ).into_response(),
    }
}

async fn get_certificate_info(
    State(state): State<AppState>,
    axum::extract::Path(domain): axum::extract::Path<String>,
) -> Response {
    let domain = domain.trim();
    
    if !state.tls.has_certificate(domain).await {
        return (axum::http::StatusCode::NOT_FOUND, Json(ErrorResponse::new(format!("No certificate found for {}", domain)))).into_response();
    }

    let domain_dir = state.tls.cert_dir().join(domain);
    let cert_path = domain_dir.join("cert.pem");
    let key_path = domain_dir.join("key.pem");
    
    if !cert_path.exists() || !key_path.exists() {
        return (axum::http::StatusCode::NOT_FOUND, Json(ErrorResponse::new(format!("Certificate files missing for {}", domain)))).into_response();
    }

    let info = CertificateInfo {
        domain: domain.to_string(),
        expires_at: None,
        is_ssl: true,
    };

    Json(info).into_response()
}

async fn delete_certificate(
    State(state): State<AppState>,
    axum::extract::Path(domain): axum::extract::Path<String>,
) -> Response {
    let domain = domain.trim();
    
    match state.tls.delete_certificate(domain).await {
        Ok(()) => Json(serde_json::json!({ "message": "Certificate deleted" })).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse::new(e.to_string())),
        ).into_response(),
    }
}

async fn list_certificates(State(state): State<AppState>) -> Response {
    let cert_dir = state.tls.cert_dir();
    let mut certificates = Vec::new();
    
    if let Ok(entries) = std::fs::read_dir(cert_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(domain) = path.file_name().and_then(|n| n.to_str()) {
                    if domain.starts_with('.') || domain == "_acme" {
                        continue;
                    }
                    let has_cert = path.join("cert.pem").exists() && path.join("key.pem").exists();
                    if has_cert {
                        certificates.push(serde_json::json!({
                            "domain": domain,
                            "is_ssl": true
                        }));
                    }
                }
            }
        }
    }

    Json(certificates).into_response()
}
