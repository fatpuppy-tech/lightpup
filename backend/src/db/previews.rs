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
            "INSERT INTO preview_environments (id, application_id, branch, url, status, expires_at, created_at, host_port, container_id) VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, NULL, NULL)",
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
            "SELECT id, application_id, branch, url, status, expires_at, created_at, host_port, container_id FROM preview_environments WHERE application_id = ?1 ORDER BY created_at DESC",
        )
        .bind(app_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    pub async fn get_preview(&self, id: &str) -> AppResult<PreviewEnvironment> {
        sqlx::query_as::<_, PreviewEnvironment>(
            "SELECT id, application_id, branch, url, status, expires_at, created_at, host_port, container_id FROM preview_environments WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Preview {} not found", id)))
    }

    pub async fn get_preview_by_url(&self, url: &str) -> AppResult<Option<PreviewEnvironment>> {
        let row = sqlx::query_as::<_, PreviewEnvironment>(
            "SELECT id, application_id, branch, url, status, expires_at, created_at, host_port, container_id FROM preview_environments WHERE url = ?1 AND host_port IS NOT NULL",
        )
        .bind(url)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row)
    }

    pub async fn update_preview_container(
        &self,
        id: &str,
        host_port: u16,
        container_id: &str,
        status: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "UPDATE preview_environments SET host_port = ?1, container_id = ?2, status = ?3 WHERE id = ?4",
        )
        .bind(host_port as i32)
        .bind(container_id)
        .bind(status)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn update_preview_status(&self, id: &str, status: &str) -> AppResult<()> {
        sqlx::query("UPDATE preview_environments SET status = ?1 WHERE id = ?2")
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    /// All ports in use by applications (primary + staging) and previews.
    pub async fn get_used_host_ports(&self) -> AppResult<Vec<u16>> {
        let app_primary: Vec<i32> = sqlx::query_scalar("SELECT port FROM applications")
            .fetch_all(&self.pool)
            .await
            .map_err(Error::from)?;
        let app_staging: Vec<Option<i32>> = sqlx::query_scalar(
            "SELECT port_staging FROM applications WHERE port_staging IS NOT NULL",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        let preview_ports: Vec<Option<i32>> = sqlx::query_scalar(
            "SELECT host_port FROM preview_environments WHERE host_port IS NOT NULL",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        let mut used: Vec<u16> = app_primary
            .into_iter()
            .map(|p| p as u16)
            .chain(app_staging.into_iter().filter_map(|p| p.map(|x| x as u16)))
            .chain(preview_ports.into_iter().filter_map(|p| p.map(|x| x as u16)))
            .collect();
        used.sort_unstable();
        used.dedup();
        Ok(used)
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

