use chrono::Utc;

use crate::{AppResult, Error};

use super::{Database, PreviewEnvironment};

impl Database {
    pub async fn create_preview(
        &self,
        id: &str,
        app_id: &str,
        branch: &str,
        url: &str,
        expires_at: Option<&str>,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO preview_environments (id, application_id, branch, url, status, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, 'running', ?5, ?6)",
        )
        .bind(id)
        .bind(app_id)
        .bind(branch)
        .bind(url)
        .bind(expires_at)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_previews(&self, app_id: &str) -> AppResult<Vec<PreviewEnvironment>> {
        let rows = sqlx::query_as::<_, PreviewEnvironment>(
            "SELECT id, application_id, branch, url, status, expires_at, created_at FROM preview_environments WHERE application_id = ?1 ORDER BY created_at DESC",
        )
        .bind(app_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    pub async fn get_preview(&self, id: &str) -> AppResult<PreviewEnvironment> {
        sqlx::query_as::<_, PreviewEnvironment>(
            "SELECT id, application_id, branch, url, status, expires_at, created_at FROM preview_environments WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Preview {} not found", id)))
    }

    pub async fn delete_preview(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM preview_environments WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn cleanup_expired_previews(&self) -> AppResult<Vec<String>> {
        let now = Utc::now().to_rfc3339();
        let ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM preview_environments WHERE expires_at IS NOT NULL AND expires_at < ?1",
        )
        .bind(&now)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        for id in &ids {
            sqlx::query("DELETE FROM preview_environments WHERE id = ?1")
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(Error::from)?;
        }
        Ok(ids)
    }
}

