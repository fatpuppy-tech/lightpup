use chrono::Utc;

use crate::{AppResult, Error};

use super::rows::UserRow;
use super::{Database, User};

impl Database {
    pub async fn count_users(&self) -> AppResult<i64> {
        let n = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(n)
    }

    pub async fn create_user(&self, id: &str, username: &str, password_hash: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)")
            .bind(id)
            .bind(username)
            .bind(password_hash)
            .bind(&now)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_user_by_username(&self, username: &str) -> AppResult<Option<User>> {
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT id, username, password_hash, totp_secret, created_at FROM users WHERE username = ?1",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row.map(User::from))
    }

    pub async fn get_user_by_id(&self, id: &str) -> AppResult<Option<User>> {
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT id, username, password_hash, totp_secret, created_at FROM users WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row.map(User::from))
    }

    pub async fn set_user_totp(&self, user_id: &str, totp_secret: Option<&str>) -> AppResult<()> {
        sqlx::query("UPDATE users SET totp_secret = ?1 WHERE id = ?2")
            .bind(totp_secret)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn set_user_password(&self, user_id: &str, password_hash: &str) -> AppResult<()> {
        sqlx::query("UPDATE users SET password_hash = ?1 WHERE id = ?2")
            .bind(password_hash)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn create_session(&self, id: &str, user_id: &str, token: &str) -> AppResult<()> {
        let now = Utc::now();
        let expires_at = now + chrono::Duration::days(30);
        let now_s = now.to_rfc3339();
        let expires_s = expires_at.to_rfc3339();
        sqlx::query(
            "INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(id)
        .bind(user_id)
        .bind(token)
        .bind(&expires_s)
        .bind(&now_s)
        .execute(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_session_user_id(&self, token: &str) -> AppResult<Option<String>> {
        let now = Utc::now().to_rfc3339();
        // Clean expired sessions
        let _ = sqlx::query("DELETE FROM sessions WHERE expires_at < ?1")
            .bind(&now)
            .execute(&self.pool)
            .await;
        let row = sqlx::query_scalar::<_, Option<String>>(
            "SELECT user_id FROM sessions WHERE token = ?1 AND expires_at > ?2",
        )
        .bind(token)
        .bind(&now)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row.flatten())
    }

    pub async fn delete_session_by_token(&self, token: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM sessions WHERE token = ?1")
            .bind(token)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn create_pending_2fa(&self, token: &str, user_id: &str) -> AppResult<()> {
        let now = Utc::now();
        let expires_at = now + chrono::Duration::minutes(5);
        let now_s = now.to_rfc3339();
        let expires_s = expires_at.to_rfc3339();
        let _ = sqlx::query("DELETE FROM pending_2fa WHERE expires_at < ?1")
            .bind(&now_s)
            .execute(&self.pool)
            .await;
        sqlx::query("INSERT INTO pending_2fa (token, user_id, expires_at) VALUES (?1, ?2, ?3)")
            .bind(token)
            .bind(user_id)
            .bind(&expires_s)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }

    pub async fn get_pending_2fa_user_id(&self, token: &str) -> AppResult<Option<String>> {
        let now = Utc::now().to_rfc3339();
        let row = sqlx::query_scalar::<_, Option<String>>(
            "SELECT user_id FROM pending_2fa WHERE token = ?1 AND expires_at > ?2",
        )
        .bind(token)
        .bind(&now)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(row.flatten())
    }

    pub async fn delete_pending_2fa(&self, token: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM pending_2fa WHERE token = ?1")
            .bind(token)
            .execute(&self.pool)
            .await
            .map_err(Error::from)?;
        Ok(())
    }
}

