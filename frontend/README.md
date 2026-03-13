# LightPup Frontend

React + Vite + TypeScript dashboard for LightPup.

## Prereqs

- Node.js (LTS)
- `pnpm`

## Development

From `frontend/`:

```bash
pnpm install
pnpm dev
```

The dev server proxies `/api` requests to the backend at `http://localhost:3000` (see `vite.config.ts`).

## Scripts

```bash
pnpm lint
pnpm test
pnpm build
pnpm preview
```

## Local API override (optional)

In development, you can override the API base by setting a global `window.__DEV_API__` before the app loads.
If you don’t need that, ignore it—the proxy setup is the default workflow.
