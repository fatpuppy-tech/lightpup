import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { Badge } from '../components/atoms/Badge'
import { EmptyState } from '../components/molecules/EmptyState'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import { GithubIcon } from '../components/atoms/NavIcons'
import type {
  Application,
  DashboardDeployment,
  DashboardSummary,
  Environment,
  Project,
} from '../lib/api'
import { api, formatDateTime, statusToBadgeVariant } from '../lib/api'

type EnvWithApps = { env: Environment; apps: Application[] }

function githubRepoFromUrl(
  repoUrl?: string | null
): { label: string; href: string } | null {
  if (!repoUrl) return null
  const trimmed = repoUrl.trim()
  if (!trimmed.includes('github.com')) return null

  let cleaned = trimmed.replace(/\.git$/i, '')

  if (cleaned.startsWith('git@github.com:')) {
    const path = cleaned.split(':')[1] ?? ''
    const parts = path.replace(/\/+$/, '').split('/')
    if (parts.length >= 2) {
      const label = `${parts[0]}/${parts[1]}`
      return { label, href: `https://github.com/${label}` }
    }
    return null
  }

  try {
    const url = new URL(cleaned)
    const parts = url.pathname.replace(/^\/|\/$/g, '').split('/')
    if (url.hostname.endsWith('github.com') && parts.length >= 2) {
      const label = `${parts[0]}/${parts[1]}`
      return { label, href: `https://github.com/${label}` }
    }
  } catch {
    // ignore invalid URLs
  }

  return null
}

export function ProjectPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [envsWithApps, setEnvsWithApps] = useState<EnvWithApps[]>([])
  const [recentDeployments, setRecentDeployments] = useState<DashboardDeployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [proj, envList] = await Promise.all([
          api<Project>(`/api/projects/${projectId}`),
          api<Environment[]>(`/api/projects/${projectId}/environments`),
        ])
        if (cancelled) return
        setProject(proj)
        if (envList.length === 0) {
          setEnvsWithApps([])
          setRecentDeployments([])
          return
        }
        const appsPerEnv = await Promise.all(
          envList.map((e) =>
            api<Application[]>(`/api/environments/${e.id}/applications`)
          )
        )
        if (cancelled) return
        const withApps: EnvWithApps[] = envList.map((e, i) => ({
          env: e,
          apps: appsPerEnv[i] ?? [],
        }))
        setEnvsWithApps(withApps)
        const allAppIds = new Set(withApps.flatMap((x) => x.apps.map((a) => a.id)))
        const dash = await api<DashboardSummary>('/api/dashboard')
        if (cancelled) return
        const filtered = (dash.recent_deployments ?? []).filter((d) =>
          allAppIds.has(d.application_id)
        )
        setRecentDeployments(filtered)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load project.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, retryCount])

  function latestDeployForApp(appId: string): DashboardDeployment | undefined {
    return recentDeployments.find((d) => d.application_id === appId)
  }

  if (!projectId) return null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack
          onBack={() => navigate('/projects')}
          trail={project?.name || 'App'}
        />
      </header>
      <PageMain className="space-y-6">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-zinc-100">{project?.name}</h2>
          {project?.description && (
            <p className="mt-1 text-xs text-zinc-500">{project.description}</p>
          )}
        </Card>

        {loading && !project && !error ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            Loading…
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Environments & apps
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/projects/${projectId}/environments/new`)}
                >
                  Add environment
                </Button>
              </div>
              {envsWithApps.length === 0 ? (
                <EmptyState
                  icon="environment"
                  title="No environments yet"
                  description="Add an environment (e.g. production or staging) to host applications."
                  action={
                    <Button
                      size="md"
                      onClick={() => navigate(`/projects/${projectId}/environments/new`)}
                    >
                      Add environment
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-4">
                  {envsWithApps.map(({ env, apps }) => (
                    <Card
                      key={env.id}
                      className="border-zinc-800/80 bg-zinc-900/70 overflow-hidden"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-100">
                            {env.name}
                          </span>
                          {env.is_production && (
                            <Badge variant="success">Production</Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            navigate(`/environments/${env.id}`, {
                              state: {
                                envName: env.name,
                                projectName: project?.name,
                                projectId,
                              },
                            })
                          }
                        >
                          View & add apps
                        </Button>
                      </div>
                      {apps.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-zinc-500">
                          No applications yet. Add one to deploy.
                        </div>
                      ) : (
                        <ul className="divide-y divide-zinc-800/80">
                          {apps.map((a) => {
                            const latest = latestDeployForApp(a.id)
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/applications/${a.id}`)}
                                  className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/50"
                                >
                                  <div className="flex min-w-0 flex-col gap-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <span
                                        className={`h-2 w-2 shrink-0 rounded-full ${
                                          a.status === 'running'
                                            ? 'bg-emerald-400'
                                            : 'bg-zinc-600'
                                        }`}
                                      />
                                      <span className="truncate text-sm font-medium text-zinc-100">
                                        {a.name}
                                      </span>
                                      {latest && (
                                        <span className="text-xs text-zinc-500">
                                          — Last: v{latest.version}{' '}
                                          <Badge
                                            variant={statusToBadgeVariant(latest.status)}
                                            className="ml-1"
                                          >
                                            {latest.status}
                                          </Badge>
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                                      <span className="font-mono">
                                        {a.image}:{a.port}
                                      </span>
                                      {githubRepoFromUrl(a.repo_url) && (
                                        <>
                                          <span>•</span>
                                          {(() => {
                                            const repo = githubRepoFromUrl(a.repo_url)
                                            if (!repo) return null
                                            return (
                                              <span className="inline-flex items-center gap-1">
                                                <GithubIcon className="mr-0 h-3.5 w-3.5 text-zinc-400" />
                                                <a
                                                  href={repo.href}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="truncate max-w-[160px] hover:text-emerald-400 hover:underline underline-offset-2"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  {repo.label}
                                                </a>
                                              </span>
                                            )
                                          })()}
                                          {a.repo_branch && (
                                            <span className="truncate max-w-[80px] text-zinc-600">
                                              ({a.repo_branch})
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </section>

            {recentDeployments.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Recent deployments
                </h3>
                <div className="space-y-2">
                  {recentDeployments.slice(0, 10).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => navigate(`/deployments/${d.id}`)}
                      className="w-full cursor-pointer text-left"
                    >
                      <Card className="flex items-center justify-between border-zinc-800/80 bg-zinc-900/70 px-4 py-3 hover:border-emerald-500 hover:bg-zinc-800/80">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-100">
                              {d.application_name}
                            </span>
                            {d.application_domain && (
                              <span className="text-[11px] text-zinc-500">
                                {d.application_domain}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                            <span>v{d.version}</span>
                            <span>•</span>
                            <span>{formatDateTime(d.started_at)}</span>
                          </div>
                        </div>
                        <Badge variant={statusToBadgeVariant(d.status)}>
                          {d.status}
                        </Badge>
                      </Card>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </PageMain>
    </div>
  )
}
