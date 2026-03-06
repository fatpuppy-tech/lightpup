use chrono::Utc;

use crate::{AppResult, Error};

use super::{Database, Project};

impl Database {
    pub async fn create_project(
        &self,
        id: &str,
        name: &str,
        description: Option<&str>,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)")
            .bind(id)
            .bind(name)
            .bind(description)
            .bind(&now)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_projects(&self) -> AppResult<Vec<Project>> {
        let rows = sqlx::query_as::<_, Project>(
            "SELECT id, name, description, created_at, updated_at FROM projects ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    pub async fn get_project(&self, id: &str) -> AppResult<Project> {
        sqlx::query_as::<_, Project>(
            "SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?
        .ok_or_else(|| Error::NotFound(format!("Project {} not found", id)))
    }

    pub async fn delete_project(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM projects WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }
}

