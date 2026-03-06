//! Shared request and response types for API handlers.

use serde::Deserialize;
use serde::Serialize;

#[derive(Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateEnvironmentRequest {
    pub name: String,
    pub is_production: bool,
}

#[derive(Deserialize)]
pub struct CreateApplicationRequest {
    pub name: String,
    pub domain: Option<String>,
    pub image: String,
    pub port: u16,
    pub repo_url: Option<String>,
    pub repo_branch: Option<String>,
    pub dockerfile_path: Option<String>,
    /// Build pack / strategy: "static", "docker", "docker_compose", "railpack".
    pub build_type: Option<String>,
    /// Server (node) id to deploy to. None = first active remote or local Docker.
    pub server_id: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateApplicationRequest {
    pub name: Option<String>,
    pub image: Option<String>,
    pub port: Option<u16>,
    pub domain: Option<String>,
    pub repo_url: Option<String>,
    pub repo_branch: Option<String>,
    pub dockerfile_path: Option<String>,
    pub build_type: Option<String>,
    /// If present (including null), update deploy target. Omit to leave unchanged.
    pub server_id: Option<Option<String>>,
}

#[derive(Deserialize)]
pub struct DeployRequest {
    pub version: String,
}

#[derive(Deserialize)]
pub struct CreatePreviewRequest {
    pub branch: String,
    pub expires_in_days: Option<i64>,
}

#[derive(Serialize)]
pub struct DashboardDeployment {
    pub id: String,
    pub application_id: String,
    pub application_name: String,
    pub application_domain: Option<String>,
    pub version: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Serialize)]
pub struct DashboardResponse {
    pub project_count: i64,
    pub environment_count: i64,
    pub application_count: i64,
    pub running_app_count: i64,
    pub deployment_count: i64,
    pub recent_deployments: Vec<DashboardDeployment>,
}

#[derive(Serialize)]
pub struct ProxyAppSummary {
    pub id: String,
    pub name: String,
    pub project_name: String,
    pub environment_name: String,
    pub domain: Option<String>,
    pub port: u16,
    pub status: String,
}

#[derive(Deserialize)]
pub struct CreateServerRequest {
    pub name: String,
    pub address: String,
    pub is_active: Option<bool>,
    pub ssh_user: Option<String>,
    pub ssh_key_path: Option<String>,
    pub ssh_key_content: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateServerRequest {
    pub name: Option<String>,
    pub address: Option<String>,
    pub is_active: Option<bool>,
    pub ssh_user: Option<String>,
    pub ssh_key_path: Option<String>,
    pub ssh_key_content: Option<String>,
}

#[derive(Deserialize)]
pub struct ProvisionRequest {
    pub domain: String,
    pub email: Option<String>,
}

#[derive(Deserialize)]
pub struct UploadCertificateRequest {
    pub domain: String,
    pub cert_pem: String,
    pub key_pem: String,
}
