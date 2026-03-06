use crate::{AppResult, Error};

use super::Database;

impl Database {
    pub async fn get_user_permissions(&self, user_id: &str) -> AppResult<Vec<String>> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT permission FROM user_permissions WHERE user_id = ?1 ORDER BY permission",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::from)?;
        Ok(rows)
    }

    pub async fn set_user_permissions(&self, user_id: &str, permissions: &[String]) -> AppResult<()> {
        let mut tx = self.pool.begin().await.map_err(Error::from)?;
        sqlx::query("DELETE FROM user_permissions WHERE user_id = ?1")
            .bind(user_id)
            .execute(&mut *tx)
            .await
            .map_err(Error::from)?;
        for perm in permissions {
            if perm.is_empty() {
                continue;
            }
            sqlx::query("INSERT INTO user_permissions (user_id, permission) VALUES (?1, ?2)")
                .bind(user_id)
                .bind(perm)
                .execute(&mut *tx)
                .await
                .map_err(Error::from)?;
        }
        tx.commit().await.map_err(Error::from)?;
        Ok(())
    }
}
