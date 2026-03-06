use chrono::Utc;

use crate::{AppResult, Error};

use super::Database;

impl Database {
    /// Project IDs the user is explicitly a member of. Empty if user has no rows (then they use global role).
    pub async fn get_project_ids_for_user(&self, user_id: &str) -> AppResult<Vec<String>> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT project_id FROM project_members WHERE user_id = ?1",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    /// Role for user on project, if they have a project_members row.
    pub async fn get_project_member_role(&self, user_id: &str, project_id: &str) -> AppResult<Option<String>> {
        let row = sqlx::query_scalar::<_, String>(
            "SELECT role FROM project_members WHERE user_id = ?1 AND project_id = ?2",
        )
        .bind(user_id)
        .bind(project_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row)
    }

    pub async fn add_project_member(
        &self,
        user_id: &str,
        project_id: &str,
        role: &str,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT OR REPLACE INTO project_members (user_id, project_id, role, created_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(user_id)
        .bind(project_id)
        .bind(role)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn remove_project_member(&self, user_id: &str, project_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM project_members WHERE user_id = ?1 AND project_id = ?2")
            .bind(user_id)
            .bind(project_id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    /// List project members for a project (user_id, role).
    pub async fn list_project_members(&self, project_id: &str) -> AppResult<Vec<(String, String)>> {
        let rows = sqlx::query_as::<_, (String, String)>(
            "SELECT user_id, role FROM project_members WHERE project_id = ?1 ORDER BY user_id",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }
}
