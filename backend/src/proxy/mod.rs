use crate::AppState;
use axum::{
    body::Body,
    extract::State,
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Redirect, Response},
};
use hyper::{Request, body::Incoming};
use hyper::header::HeaderValue;
use http_body_util::BodyExt as _;
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use hyper_util::rt::TokioExecutor;

fn build_client() -> Client<HttpConnector, Body> {
    let mut connector = HttpConnector::new();
    connector.enforce_http(false);
    Client::builder(TokioExecutor::new()).build(connector)
}

pub async fn proxy_request(
    State(state): State<AppState>,
    mut req: Request<Body>,
) -> Result<Response, StatusCode> {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();

    let hostname = host.split(':').next().unwrap_or("");

    if hostname == "localhost" || hostname == "127.0.0.1" {
        return Ok(Redirect::to("/ui/").into_response());
    }

    // Preview URLs (e.g. feature-x.preview.localhost) route to preview container port.
    if let Ok(Some(preview)) = state.db.get_preview_by_url(hostname).await {
        if let Some(host_port) = preview.host_port {
            let port = host_port as u16;
            let path_and_query = req
                .uri()
                .path_and_query()
                .map(|pq| pq.as_str())
                .unwrap_or("/");
            let uri_str = format!("http://127.0.0.1:{}{}", port, path_and_query);
            let uri = uri_str
                .parse::<Uri>()
                .map_err(|_| StatusCode::BAD_GATEWAY)?;
            *req.uri_mut() = uri;
            if let Ok(host_header) = HeaderValue::from_str(&format!("127.0.0.1:{}", port)) {
                req.headers_mut().insert(header::HOST, host_header);
            }
            let client = build_client();
            let res = client
                .request(req)
                .await
                .map_err(|_| StatusCode::BAD_GATEWAY)?;
            let (parts, body): (_, Incoming) = res.into_parts();
            let body = Body::from_stream(body.into_data_stream());
            return Ok(Response::from_parts(parts, body));
        }
    }

    let app = match state.db.get_application_by_domain(hostname).await {
        Ok(app) => app,
        Err(_) => return Err(StatusCode::NOT_FOUND),
    };

    let port = if app.live_slot == "secondary" {
        app.port_staging
    } else {
        app.port
    };

    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");

    let uri_str = format!("http://127.0.0.1:{}{}", port, path_and_query);
    let uri = uri_str
        .parse::<Uri>()
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    *req.uri_mut() = uri;

    if let Ok(host_header) = HeaderValue::from_str(&format!("127.0.0.1:{}", port)) {
        req.headers_mut().insert(header::HOST, host_header);
    }

    let client = build_client();

    let res = client
        .request(req)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let (parts, body): (_, Incoming) = res.into_parts();
    let body = Body::from_stream(body.into_data_stream());
    Ok(Response::from_parts(parts, body))
}
