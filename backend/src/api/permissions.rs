//! Centralized permission handling.
//!
//! **Roles (global):**
//! - **admin**: Full access; manage users, invites, all projects/servers.
//! - **member**: Deploy, create/edit/delete projects, environments, applications, servers, cron, previews. Cannot manage users/invites.
//! - **viewer**: Read-only; cannot mutate any resource.
//!
//! **Resource-scoped (optional):**
//! - **Global admin**: sees and can act on all projects.
//! - **Everyone else**: can only see and act on projects they are a member of (project_members with viewer/member/admin). Users with no project_members rows see no projects.

use crate::api::auth::CurrentUser;
use crate::AppState;
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};

/// Role names used in DB and API.
pub mod roles {
    pub const ADMIN: &str = "admin";
    pub const MEMBER: &str = "member";
    pub const VIEWER: &str = "viewer";
}

/// Fine-grained permission keys (stored in user_permissions). Additive to role.
pub mod permission_keys {
    /// Can open server terminal (local or SSH).
    pub const TERMINAL: &str = "terminal";
    /// Can create, edit, and delete servers.
    pub const MANAGE_SERVERS: &str = "manage_servers";
    /// Can trigger deployments (for viewers; members already can).
    pub const DEPLOY: &str = "deploy";
    /// Can create, edit, delete projects and environments.
    pub const MANAGE_PROJECTS: &str = "manage_projects";
    /// Can add/remove project members (project-level; global admin always can).
    pub const MANAGE_MEMBERS: &str = "manage_members";
}

/// Returns true if the user can manage users and invites (admin only).
pub fn can_manage_users(user: &CurrentUser) -> bool {
    user.role == roles::ADMIN
}

/// Returns true if the user can perform mutations (create/update/delete) on projects, apps, servers, etc.
pub fn can_mutate_globally(user: &CurrentUser) -> bool {
    user.role == roles::ADMIN || user.role == roles::MEMBER
}

/// Returns true if the user has read-only access globally (viewer).
pub fn is_viewer(user: &CurrentUser) -> bool {
    user.role == roles::VIEWER
}

/// Returns true if the user can use server terminal: admin/member by role, or has "terminal" permission.
pub async fn can_use_terminal(state: &AppState, user: &CurrentUser) -> Result<bool, Response> {
    if user.role == roles::ADMIN || user.role == roles::MEMBER {
        return Ok(true);
    }
    let perms = state.db.get_user_permissions(&user.id).await.map_err(|_| internal_error())?;
    Ok(perms.iter().any(|p| p == permission_keys::TERMINAL))
}

/// Require terminal access. Returns 403 if not allowed.
pub async fn require_can_use_terminal(
    state: &AppState,
    user: &CurrentUser,
) -> Result<(), Response> {
    if can_use_terminal(state, user).await? {
        Ok(())
    } else {
        Err(forbidden("Terminal access is not allowed for your account"))
    }
}

/// Returns true if the user can manage servers: admin/member by role, or has "manage_servers" permission.
pub async fn can_manage_servers(state: &AppState, user: &CurrentUser) -> Result<bool, Response> {
    if user.role == roles::ADMIN || user.role == roles::MEMBER {
        return Ok(true);
    }
    let perms = state.db.get_user_permissions(&user.id).await.map_err(|_| internal_error())?;
    Ok(perms.iter().any(|p| p == permission_keys::MANAGE_SERVERS))
}

/// Require server management. Returns 403 if not allowed.
pub async fn require_can_manage_servers(
    state: &AppState,
    user: &CurrentUser,
) -> Result<(), Response> {
    if can_manage_servers(state, user).await? {
        Ok(())
    } else {
        Err(forbidden("Server management is not allowed for your account"))
    }
}

/// Require admin. Use for user management, invites. Returns 403 if not admin.
pub fn require_admin(user: &CurrentUser) -> Result<(), Response> {
    if !can_manage_users(user) {
        return Err(forbidden("Admin role required"));
    }
    Ok(())
}

/// Require member or admin (no viewers). Use for any mutation. Returns 403 if viewer.
pub fn require_member(user: &CurrentUser) -> Result<(), Response> {
    if !can_mutate_globally(user) {
        return Err(forbidden("Viewer role cannot perform this action"));
    }
    Ok(())
}

/// Require that the user can mutate the given project: either global admin/member with no project scoping,
/// or has a project_member row for this project with role member or admin.
pub async fn require_can_mutate_project(
    state: &AppState,
    user: &CurrentUser,
    project_id: &str,
) -> Result<(), Response> {
    if user.role == roles::ADMIN {
        return Ok(());
    }
    let project_ids = match state.db.get_project_ids_for_user(&user.id).await {
        Ok(ids) => ids,
        Err(_) => return Err(internal_error()),
    };
    // No project_members rows => global member/viewer; allow mutate only if global member.
    if project_ids.is_empty() {
        return if user.role == roles::MEMBER {
            Ok(())
        } else {
            Err(forbidden("Viewer role cannot perform this action"))
        };
    }
    // Has project_members => must have access to this project with member or admin role.
    if !project_ids.iter().any(|id| id.as_str() == project_id) {
        return Err(forbidden("No access to this project"));
    }
    let role = state
        .db
        .get_project_member_role(&user.id, project_id)
        .await
        .ok()
        .flatten();
    match role.as_deref() {
        Some(roles::ADMIN) | Some(roles::MEMBER) => Ok(()),
        _ => Err(forbidden("No write access to this project")),
    }
}

/// Require that the user can view the given project (for get/list). Global admin can view all; others must be a project member (viewer/member/admin).
pub async fn require_can_view_project(
    state: &AppState,
    user: &CurrentUser,
    project_id: &str,
) -> Result<(), Response> {
    if user.role == roles::ADMIN {
        return Ok(());
    }
    let project_ids = match state.db.get_project_ids_for_user(&user.id).await {
        Ok(ids) => ids,
        Err(_) => return Err(internal_error()),
    };
    if project_ids.iter().any(|id| id.as_str() == project_id) {
        return Ok(());
    }
    Err(forbidden("No access to this project"))
}

/// Filter project IDs to those the user is allowed to see. Returns None for "all" (global admin only); otherwise Some(ids), which may be empty if the user has no project memberships.
pub async fn visible_project_ids(state: &AppState, user_id: &str, user_role: &str) -> Option<Vec<String>> {
    if user_role == roles::ADMIN {
        return None; // See all
    }
    let ids = state.db.get_project_ids_for_user(user_id).await.ok()?;
    Some(ids)
}

fn forbidden(message: &str) -> Response {
    (
        StatusCode::FORBIDDEN,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

fn internal_error() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": "Permission check failed" })),
    )
        .into_response()
}
