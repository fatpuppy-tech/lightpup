use chrono::Utc;
use sqlx::FromRow;

use crate::{AppResult, Error};

use super::{Database, Deployment};

impl Database {
    pub async fn create_deployment(&self, id: &str, app_id: &str, version: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO deployments (id, application_id, version, status, started_at) VALUES (?1, ?2, ?3, 'pending', ?4)",
        )
        .bind(id)
        .bind(app_id)
        .bind(version)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn update_deployment_status(
        &self,
        id: &str,
        status: &str,
        logs: Option<&str>,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        if let Some(logs) = logs {
            sqlx::query("UPDATE deployments SET status = ?1, logs = ?2, finished_at = ?3 WHERE id = ?4")
                .bind(status)
                .bind(logs)
                .bind(&now)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(Error::from)?;
        } else {
            sqlx::query("UPDATE deployments SET status = ?1 WHERE id = ?2")
                .bind(status)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(Error::from)?;
        }
        Ok(())
    }

    pub async fn get_deployments(&self, app_id: &str) -> AppResult<Vec<Deployment>> {
        self.get_deployments_paginated(app_id, 50, 0).await
    }

    /// Paginated list: limit (max 100), offset.
    pub async fn get_deployments_paginated(
        &self,
        app_id: &str,
        limit: u32,
        offset: u32,
    ) -> AppResult<Vec<Deployment>> {
        let limit = limit.min(100);
        let rows = sqlx::query_as::<_, Deployment>(
            "SELECT id, application_id, version, status, logs, started_at, finished_at FROM deployments WHERE application_id = ?1 ORDER BY started_at DESC LIMIT ?2 OFFSET ?3",
        )
        .bind(app_id)
        .bind(limit as i32)
        .bind(offset as i32)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    pub async fn get_deployment(&self, id: &str) -> AppResult<Deployment> {
        sqlx::query_as::<_, Deployment>(
            "SELECT id, application_id, version, status, logs, started_at, finished_at FROM deployments WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Deployment {} not found", id)))
    }

    /// Recent deployments with app name/domain for dashboard.
    pub async fn get_recent_deployments_with_app(
        &self,
        limit: u32,
    ) -> AppResult<Vec<(Deployment, String, Option<String>)>> {
        #[derive(FromRow)]
        struct RecentDeploymentRow {
            id: String,
            application_id: String,
            version: String,
            status: String,
            logs: Option<String>,
            started_at: String,
            finished_at: Option<String>,
            application_name: String,
            application_domain: Option<String>,
        }

        let rows = sqlx::query_as::<_, RecentDeploymentRow>(
            "SELECT d.id, d.application_id, d.version, d.status, d.logs, d.started_at, d.finished_at, a.name AS application_name, a.domain AS application_domain \
             FROM deployments d JOIN applications a ON d.application_id = a.id ORDER BY d.started_at DESC LIMIT ?1",
        )
        .bind(limit as i32)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;

        Ok(rows
            .into_iter()
            .map(|r| {
                (
                    Deployment {
                        id: r.id,
                        application_id: r.application_id,
                        version: r.version,
                        status: r.status,
                        logs: r.logs,
                        started_at: r.started_at,
                        finished_at: r.finished_at,
                    },
                    r.application_name,
                    r.application_domain,
                )
            })
            .collect())
    }
}

