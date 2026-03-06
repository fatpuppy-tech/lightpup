//! API routes: each domain in its own module for readability and maintainability.

mod auth;
mod applications;
pub mod error;
mod dashboard;
mod deploy;
mod deployments;
mod instance;
mod previews;
mod projects;
mod proxy;
mod servers;
mod types;
mod webhooks;
mod ssl;

use crate::AppState;
use axum::{middleware, Router};

pub fn routes(state: AppState) -> Router<AppState> {
    let public = auth::public_routes()
        .merge(ssl::routes());
    let protected = Router::new()
        .merge(projects::routes())
        .merge(applications::routes())
        .merge(deploy::routes())
        .merge(deployments::routes())
        .merge(previews::routes())
        .merge(dashboard::routes())
        .merge(proxy::routes())
        .merge(instance::routes())
        .merge(auth::protected_routes())
        .merge(webhooks::routes())
        .merge(servers::routes())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_auth_middleware,
        ));
    public.merge(protected)
}