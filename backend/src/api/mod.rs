//! API routes: each domain in its own module for readability and maintainability.

mod auth;
mod applications;
mod cron_jobs;
mod permissions;
mod dashboard;
pub mod deploy;
mod deployments;
mod error;
mod github;
mod instance;
mod invites;
mod previews;
mod projects;
mod proxy;
mod servers;
mod types;
mod users;
mod webhooks;
mod ssl;

use crate::AppState;
use axum::{middleware, Router};

pub fn routes(state: AppState) -> Router<AppState> {
    let public = auth::public_routes()
        .merge(invites::public_routes())
        .merge(ssl::routes())
        .merge(github::routes());
    let protected = Router::new()
        .merge(projects::routes())
        .merge(applications::routes())
        .merge(cron_jobs::routes())
        .merge(deploy::routes())
        .merge(deployments::routes())
        .merge(previews::routes())
        .merge(dashboard::routes())
        .merge(proxy::routes())
        .merge(instance::routes())
        .merge(auth::protected_routes())
        .merge(webhooks::routes())
        .merge(servers::routes())
        .merge(users::routes())
        .merge(invites::protected_routes())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth_middleware,
        ));
    public.merge(protected)
}