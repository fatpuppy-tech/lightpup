use crate::{AppResult, Error};

use super::rows::application_from_row;
use super::{Application, Database};

impl Database {
    /// List recent applications across all environments for dashboard.
    pub async fn get_recent_applications(&self, limit: u32) -> AppResult<Vec<Application>> {
        let rows = sqlx::query(
            "SELECT id, environment_id, name, domain, image, port, status, created_at, updated_at, repo_url, repo_branch, dockerfile_path, build_type, node_id \
             FROM applications ORDER BY created_at DESC LIMIT ?1",
        )
        .bind(limit as i32)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows.into_iter().map(application_from_row).collect())
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

