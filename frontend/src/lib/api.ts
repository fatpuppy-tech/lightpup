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
  port_staging: number
  live_slot: string
  status: string
  build_type: 'static' | 'docker' | 'docker_compose' | 'railpack'
  repo_url?: string | null
  repo_branch?: string | null
  dockerfile_path?: string | null
  dockerfile_content?: string | null
  docker_compose_content?: string | null
  /** Server (node) to deploy to. Null = first active remote or local Docker. */
  server_id?: string | null
  /** Deployment currently receiving traffic. */
  live_deployment_id?: string | null
  health_path?: string | null
  health_timeout_secs?: number | null
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

export type ScheduledJob = {
  id: string
  application_id: string
  name: string
  cron_expression: string
  enabled: number
  last_run_at?: string | null
  created_at: string
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

/** Label for terminal header: "Local shell" or "SSH: user@host" */
export function getTerminalConnectionLabel(server: Server): string {
  const addr = server.address.trim()
  const isLocal =
    addr.toLowerCase() === 'localhost' ||
    addr === '127.0.0.1' ||
    (!server.ssh_user && !addr.startsWith('ssh ') && !addr.includes('@'))
  return isLocal
    ? 'Local shell'
    : `SSH: ${server.ssh_user ?? 'ssh'}@${addr.replace(/^ssh\s+/, '')}`
}

export function isTerminalLocal(server: Server): boolean {
  const addr = server.address.trim().toLowerCase()
  return (
    addr === 'localhost' ||
    addr === '127.0.0.1' ||
    (!server.ssh_user && !server.address.trim().startsWith('ssh ') && !server.address.includes('@'))
  )
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
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type')
  const text = await res.text()
  if (!contentType?.includes('application/json')) {
    throw new Error(
      text.startsWith('<')
        ? 'Server returned an HTML page instead of JSON. You may not have access to this resource, or your session expired.'
        : text || 'Invalid response from server'
    )
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Server returned invalid JSON.')
  }
}

export type AuthUser = {
  username: string
  id: string
  role: string
  permissions?: string[]
}

/** admin | member | viewer. viewer = read-only; member = can deploy/edit; admin = + user management */
export function canEdit(user: AuthUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'member'
}
export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin'
}

/** Can open server terminal: admin/member by role, or has "terminal" permission. */
export function canUseTerminal(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'member') return true
  return (user.permissions ?? []).includes(PERMISSION_KEYS.terminal)
}

/** Can create/edit/delete servers: admin/member by role, or has "manage_servers" permission. */
export function canManageServers(user: AuthUser | null): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'member') return true
  return (user.permissions ?? []).includes(PERMISSION_KEYS.manage_servers)
}

export type UserInfo = {
  id: string
  username: string
  role: string
  created_at: string
  permissions: string[]
}

/** Fine-grained permission keys (must match backend). Additive to role. */
export const PERMISSION_KEYS = {
  terminal: 'terminal',
  manage_servers: 'manage_servers',
  deploy: 'deploy',
  manage_projects: 'manage_projects',
  manage_members: 'manage_members',
} as const

export const PERMISSION_LABELS: Record<string, string> = {
  terminal: 'Terminal access',
  manage_servers: 'Manage servers',
  deploy: 'Trigger deployments',
  manage_projects: 'Manage projects & environments',
  manage_members: 'Manage project members',
}

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  terminal: 'Open server shell (local or SSH)',
  manage_servers: 'Add, edit, and remove servers',
  deploy: 'Trigger app deployments',
  manage_projects: 'Create and edit projects and environments',
  manage_members: 'Add and remove project members',
}

export async function setUserPermissions(
  userId: string,
  permissions: string[]
): Promise<{ permissions: string[] }> {
  return api(`/api/users/${encodeURIComponent(userId)}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  })
}

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

export async function listUsers(): Promise<UserInfo[]> {
  return api<UserInfo[]>('/api/users')
}

export async function getUser(userId: string): Promise<UserInfo> {
  return api<UserInfo>(`/api/users/${encodeURIComponent(userId)}`)
}

export async function createUser(params: {
  username: string
  password: string
  role?: string
}): Promise<UserInfo> {
  return api<UserInfo>('/api/users', {
    method: 'POST',
    body: JSON.stringify({
      username: params.username,
      password: params.password,
      role: params.role ?? 'member',
    }),
  })
}

export async function updateUserRole(userId: string, role: string): Promise<UserInfo> {
  const u = await api<UserInfo>(`/api/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
  return u
}

export type ProjectMemberInfo = { user_id: string; username: string; role: string }

export async function listProjectMembers(projectId: string): Promise<ProjectMemberInfo[]> {
  return api<ProjectMemberInfo[]>(`/api/projects/${projectId}/members`)
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role?: string
): Promise<ProjectMemberInfo> {
  return api<ProjectMemberInfo>(`/api/projects/${projectId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, role: role ?? 'member' }),
  })
}

export async function removeProjectMember(
  projectId: string,
  userId: string
): Promise<void> {
  await api(`/api/projects/${projectId}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}

export type EnvVarItem = { key: string; value: string }

export async function listProjectEnv(projectId: string): Promise<EnvVarItem[]> {
  return api<EnvVarItem[]>(`/api/projects/${projectId}/env`)
}

export async function setProjectEnv(
  projectId: string,
  key: string,
  value: string
): Promise<EnvVarItem> {
  return api<EnvVarItem>(`/api/projects/${projectId}/env`, {
    method: 'POST',
    body: JSON.stringify({ key: key.trim(), value }),
  })
}

export async function deleteProjectEnv(projectId: string, key: string): Promise<void> {
  await api(`/api/projects/${projectId}/env/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
}

export async function getEnvironment(environmentId: string): Promise<Environment> {
  return api<Environment>(`/api/environments/${encodeURIComponent(environmentId)}`)
}

export async function listApplicationEnv(applicationId: string): Promise<EnvVarItem[]> {
  return api<EnvVarItem[]>(`/api/applications/${applicationId}/env`)
}

export async function setApplicationEnv(
  applicationId: string,
  key: string,
  value: string
): Promise<EnvVarItem> {
  return api<EnvVarItem>(`/api/applications/${applicationId}/env`, {
    method: 'POST',
    body: JSON.stringify({ key: key.trim(), value }),
  })
}

export async function deleteApplicationEnv(
  applicationId: string,
  key: string
): Promise<void> {
  await api(`/api/applications/${applicationId}/env/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  })
}

export type CreateInviteResponse = {
  invite_link: string
  token: string
  username: string
  role: string
  expires_at: string
}

export async function createInvite(params: {
  username: string
  role?: string
  email?: string
  expires_in_days?: number
}): Promise<CreateInviteResponse> {
  return api<CreateInviteResponse>('/api/invites', {
    method: 'POST',
    body: JSON.stringify({
      username: params.username.trim(),
      role: params.role ?? 'member',
      email: params.email?.trim() || undefined,
      expires_in_days: params.expires_in_days ?? 7,
    }),
  })
}

export type InviteInfo = { username: string; role: string; valid: boolean }

export async function getInvite(token: string): Promise<InviteInfo> {
  return api<InviteInfo>(`/api/invite/${encodeURIComponent(token)}`)
}

export async function acceptInvite(token: string, password: string): Promise<{ ok: boolean; username: string }> {
  return api<{ ok: boolean; username: string }>(`/api/invite/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: JSON.stringify({ password }),
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

