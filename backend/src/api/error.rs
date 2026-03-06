//! Standard API error envelope and validation helpers.

use axum::{
    http::StatusCode,
    Json,
};
use serde::Serialize;

use crate::Error;

/// Standard JSON error response: `{ "error": "...", "details": "..."? }`.
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl ErrorResponse {
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            details: None,
        }
    }

    pub fn with_details(error: impl Into<String>, details: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            details: Some(details.into()),
        }
    }
}

/// Map app errors to HTTP status and JSON envelope.
pub fn error_response(e: &Error) -> (StatusCode, Json<ErrorResponse>) {
    let (status, error_msg) = match e {
        Error::NotFound(_) => (StatusCode::NOT_FOUND, e.to_string()),
        Error::InvalidInput(_) => (StatusCode::BAD_REQUEST, e.to_string()),
        Error::AlreadyExists(_) => (StatusCode::CONFLICT, e.to_string()),
        Error::Database(_) | Error::Docker(_) | Error::Io(_) | Error::Internal(_) => {
            (StatusCode::INTERNAL_SERVER_ERROR, "An internal error occurred".to_string())
        }
    };
    (status, Json(ErrorResponse::new(error_msg)))
}

/// Return 400 Bad Request with optional details.
pub fn bad_request(error: impl Into<String>, details: Option<impl Into<String>>) -> (StatusCode, Json<ErrorResponse>) {
    let err = error.into();
    let resp = match details {
        Some(d) => ErrorResponse::with_details(err, d),
        None => ErrorResponse::new(err),
    };
    (StatusCode::BAD_REQUEST, Json(resp))
}

/// Return 404 Not Found.
pub fn not_found(message: impl Into<String>) -> (StatusCode, Json<ErrorResponse>) {
    (StatusCode::NOT_FOUND, Json(ErrorResponse::new(message)))
}

/// Return 500 Internal Server Error (for non-AppError cases).
pub fn internal_error(message: impl Into<String>) -> (StatusCode, Json<ErrorResponse>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse::new(message)))
}

// --- Validation helpers ---

pub const NAME_MAX_LEN: usize = 256;
pub const DOMAIN_MAX_LEN: usize = 253;
pub const PORT_MIN: u16 = 1;
pub const PORT_MAX: u16 = 65535;

/// Validate a name (project, app, server, etc.): non-empty, trimmed length <= max.
pub fn validate_name(name: &str, max_len: usize) -> Result<(), String> {
    let s = name.trim();
    if s.is_empty() {
        return Err("Name is required".to_string());
    }
    if s.len() > max_len {
        return Err(format!("Name must be at most {} characters", max_len));
    }
    Ok(())
}

/// Validate optional domain: if present, non-empty and reasonable length.
pub fn validate_domain_optional(domain: Option<&str>) -> Result<(), String> {
    let Some(d) = domain else { return Ok(()) };
    let d = d.trim();
    if d.is_empty() {
        return Ok(());
    }
    if d.len() > DOMAIN_MAX_LEN {
        return Err(format!("Domain must be at most {} characters", DOMAIN_MAX_LEN));
    }
    // Basic hostname: allow letters, digits, hyphen, dot
    if !d.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err("Domain contains invalid characters".to_string());
    }
    Ok(())
}

/// Validate port range.
pub fn validate_port(port: u16) -> Result<(), String> {
    if (PORT_MIN..=PORT_MAX).contains(&port) {
        Ok(())
    } else {
        Err(format!("Port must be between {} and {}", PORT_MIN, PORT_MAX))
    }
}
