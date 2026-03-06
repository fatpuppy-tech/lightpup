export type Project = {
  id: string
  name: string
  description?: string | null
}

export type Environment = {
  id: string
  project_id: string
  name: string
  is_production: boolean
}

export type Application = {
  id: string
  environment_id: string
  name: string
  domain?: string | null
  image: string
  port: number
  status: string
  build_type: 'static' | 'docker' | 'docker_compose' | 'railpack'
  repo_url?: string | null
  repo_branch?: string | null
  dockerfile_path?: string | null
  /** Server (node) to deploy to. Null = first active remote or local Docker. */
  server_id?: string | null
}

export type Deployment = {
  id: string
  application_id: string
  version: string
  status: string
  logs?: string | null
  started_at: string
  finished_at?: string | null
}

export type DashboardDeployment = {
  id: string
  application_id: string
  application_name: string
  application_domain?: string | null
  version: string
  status: string
  started_at: string
  finished_at?: string | null
}

export type DashboardSummary = {
  project_count: number
  environment_count: number
  application_count: number
  running_app_count: number
  deployment_count: number
  recent_deployments: DashboardDeployment[]
}

export type ProxyApp = {
  id: string
  name: string
  project_name: string
  environment_name: string
  domain?: string | null
  port: number
  status: string
}

export type Server = {
  id: string
  name: string
  address: string
  ssh_user?: string | null
  ssh_key_path?: string | null
  ssh_key_content?: string | null
  is_active: boolean
  created_at: string
}

const API_BASE =
  typeof window !== 'undefined' && (window as unknown as { __DEV_API__?: string }).__DEV_API__
    ? (window as unknown as { __DEV_API__: string }).__DEV_API__
    : ''

let api401Handler: (() => void) | null = null

export function setApi401Handler(handler: (() => void) | null) {
  api401Handler = handler
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init && init.headers),
    },
  })
  if (res.status === 401) {
    api401Handler?.()
    const text = await res.text()
    throw new Error(text || 'Unauthorized')
  }
  if (!res.ok) {
    const contentType = res.headers.get('content-type')
    const text = await res.text()
    if (contentType?.includes('application/json') && text) {
      try {
        const json = JSON.parse(text) as { error?: string; details?: string }
        const msg = json.details ? `${json.error}: ${json.details}` : (json.error ?? text)
        throw new Error(msg)
      } catch (e) {
        if (e instanceof Error && e.message !== text) throw e
      }
    }
    throw new Error(text || res.statusText)
  }
  return res.json()
}

export type AuthUser = { username: string; id: string }

export async function authMe(): Promise<AuthUser> {
  return api<AuthUser>('/api/auth/me')
}

export async function authSetupRequired(): Promise<{ required: boolean }> {
  return api('/api/auth/setup-required')
}

export async function authSetup(username: string, password: string): Promise<void> {
  await api('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function authLogin(
  username: string,
  password: string
): Promise<{ ok?: boolean; username?: string; needs_2fa?: boolean }> {
  return api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function authLogout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' })
}

export async function auth2faVerify(
  code: string
): Promise<{ ok?: boolean; username?: string; id?: string }> {
  return api('/api/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function auth2faStatus(): Promise<{ enabled: boolean }> {
  return api('/api/auth/2fa/status')
}

export async function auth2faSetup(): Promise<{
  secret_base32: string
  qr_uri: string
  qr_base64?: string
}> {
  return api('/api/auth/2fa/setup')
}

export async function auth2faConfirm(code: string): Promise<void> {
  await api('/api/auth/2fa/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export async function authChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await api('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  })
}

export function formatDateTime(value: string) {
  if (!value) return ''
  return new Date(value).toLocaleString()
}

export type OnboardingStatus = {
  needs_onboarding: boolean
  server_count: number
  project_count: number
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  return api('/api/onboarding')
}

export function statusToBadgeVariant(status: string) {
  if (status === 'success') return 'success' as const
  if (status === 'failed') return 'danger' as const
  // running / pending = currently deploying → yellow
  return 'warning' as const
}

