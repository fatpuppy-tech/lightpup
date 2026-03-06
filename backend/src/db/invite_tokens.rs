use chrono::{Duration, Utc};

use crate::{AppResult, Error};

use super::Database;

impl Database {
    pub async fn create_invite_token(
        &self,
        id: &str,
        token: &str,
        username: &str,
        role: &str,
        email: Option<&str>,
        expires_in_days: u32,
    ) -> AppResult<()> {
        let now = Utc::now();
        let expires_at = now + Duration::days(expires_in_days as i64);
        let now_s = now.to_rfc3339();
        let expires_s = expires_at.to_rfc3339();
        sqlx::query(
            "INSERT INTO invite_tokens (id, token, username, role, email, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(id)
        .bind(token)
        .bind(username)
        .bind(role)
        .bind(email)
        .bind(&now_s)
        .bind(&expires_s)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_invite_by_token(&self, token: &str) -> AppResult<Option<InviteRow>> {
        let now = Utc::now().to_rfc3339();
        let row = sqlx::query_as::<_, InviteRow>(
            "SELECT id, token, username, role, email, created_at, expires_at, used_at FROM invite_tokens WHERE token = ?1 AND used_at IS NULL AND expires_at > ?2",
        )
        .bind(token)
        .bind(&now)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row)
    }

    pub async fn mark_invite_used(&self, id: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE invite_tokens SET used_at = ?1 WHERE id = ?2")
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }
}

#[derive(Debug, sqlx::FromRow)]
pub struct InviteRow {
    pub id: String,
    pub token: String,
    pub username: String,
    pub role: String,
    pub email: Option<String>,
    pub created_at: String,
    pub expires_at: String,
    pub used_at: Option<String>,
}
