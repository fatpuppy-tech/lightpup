use sqlx::Row;

use crate::{AppResult, Error};

use super::rows::application_from_row;
use super::{Application, Database};

impl Database {
    /// List recent applications across all environments for dashboard.
    pub async fn get_recent_applications(&self, limit: u32) -> AppResult<Vec<Application>> {
        let rows = sqlx::query(
            "SELECT id, environment_id, name, domain, image, port, port_staging, live_slot, status, created_at, updated_at, repo_url, repo_branch, dockerfile_path, dockerfile_content, docker_compose_content, build_type, node_id, live_deployment_id, health_path, health_timeout_secs \
             FROM applications ORDER BY created_at DESC LIMIT ?1",
        )
        .bind(limit as i32)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows.into_iter().map(application_from_row).collect())
    }

    /// Recent applications with their project_id (for permission filtering).
    pub async fn get_recent_applications_with_project_ids(
        &self,
        limit: u32,
    ) -> AppResult<Vec<(Application, String)>> {
        let rows = sqlx::query(
            "SELECT a.id, a.environment_id, a.name, a.domain, a.image, a.port, a.port_staging, a.live_slot, a.status, a.created_at, a.updated_at, a.repo_url, a.repo_branch, a.dockerfile_path, a.dockerfile_content, a.docker_compose_content, a.build_type, a.node_id, a.live_deployment_id, a.health_path, a.health_timeout_secs, e.project_id \
             FROM applications a JOIN environments e ON a.environment_id = e.id ORDER BY a.created_at DESC LIMIT ?1",
        )
        .bind(limit as i32)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        let out: Vec<(Application, String)> = rows
            .into_iter()
            .map(|row| {
                let project_id = row.try_get::<String, _>("project_id").unwrap_or_default();
                let app = application_from_row(row);
                (app, project_id)
            })
            .collect();
        Ok(out)
    }

    pub async fn get_dashboard_counts(&self) -> AppResult<(i64, i64, i64, i64, i64)> {
        let project_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
            .fetch_one(&self.pool)
            .await
            .map_err(Error::from)?;
        let environment_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM environments")
            .fetch_one(&self.pool)
            .await
            .map_err(Error::from)?;
        let application_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM applications")
            .fetch_one(&self.pool)
            .await
            .map_err(Error::from)?;
        let running_app_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM applications WHERE status = 'running'")
                .fetch_one(&self.pool)
                .await
                .map_err(Error::from)?;
        let deployment_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM deployments")
            .fetch_one(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok((
            project_count,
            environment_count,
            application_count,
            running_app_count,
            deployment_count,
        ))
    }
}

