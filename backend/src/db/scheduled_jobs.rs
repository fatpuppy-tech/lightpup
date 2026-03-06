use chrono::Utc;

use crate::{AppResult, Error};

use super::{Database, ScheduledJob};

impl Database {
    pub async fn create_scheduled_job(
        &self,
        id: &str,
        application_id: &str,
        name: &str,
        cron_expression: &str,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO scheduled_jobs (id, application_id, name, cron_expression, enabled, created_at) VALUES (?1, ?2, ?3, ?4, 1, ?5)",
        )
        .bind(id)
        .bind(application_id)
        .bind(name)
        .bind(cron_expression)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_scheduled_jobs_by_application(&self, application_id: &str) -> AppResult<Vec<ScheduledJob>> {
        let rows = sqlx::query_as::<_, ScheduledJob>(
            "SELECT id, application_id, name, cron_expression, enabled, last_run_at, created_at FROM scheduled_jobs WHERE application_id = ?1 ORDER BY created_at DESC",
        )
        .bind(application_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    pub async fn get_enabled_scheduled_jobs(&self) -> AppResult<Vec<ScheduledJob>> {
        let rows = sqlx::query_as::<_, ScheduledJob>(
            "SELECT id, application_id, name, cron_expression, enabled, last_run_at, created_at FROM scheduled_jobs WHERE enabled = 1",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    pub async fn get_scheduled_job(&self, id: &str) -> AppResult<ScheduledJob> {
        sqlx::query_as::<_, ScheduledJob>(
            "SELECT id, application_id, name, cron_expression, enabled, last_run_at, created_at FROM scheduled_jobs WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Scheduled job {} not found", id)))
    }

    pub async fn update_scheduled_job(
        &self,
        id: &str,
        name: Option<&str>,
        cron_expression: Option<&str>,
        enabled: Option<bool>,
    ) -> AppResult<()> {
        if name.is_some() || cron_expression.is_some() || enabled.is_some() {
            let enabled_int = enabled.map(|e| if e { 1 } else { 0 });
            sqlx::query(
                "UPDATE scheduled_jobs SET name = COALESCE(?1, name), cron_expression = COALESCE(?2, cron_expression), enabled = COALESCE(?3, enabled) WHERE id = ?4",
            )
            .bind(name)
            .bind(cron_expression)
            .bind(enabled_int)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        }
        Ok(())
    }

    pub async fn set_scheduled_job_last_run(&self, id: &str, at: &str) -> AppResult<()> {
        sqlx::query("UPDATE scheduled_jobs SET last_run_at = ?1 WHERE id = ?2")
            .bind(at)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn delete_scheduled_job(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM scheduled_jobs WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }
}
