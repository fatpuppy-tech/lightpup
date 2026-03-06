import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { Badge } from '../components/atoms/Badge'
import { GithubIcon } from '../components/atoms/NavIcons'
import { DashboardSkeleton } from '../components/molecules/DashboardSkeleton'
import { PageHeader } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import { ProjectCard } from '../components/molecules/ProjectCard'
import { ServerCard } from '../components/molecules/ServerCard'
import type { Application, DashboardSummary, Project, Server } from '../lib/api'
import { api, formatDateTime, statusToBadgeVariant } from '../lib/api'

type InstanceInfo = {
  version: string
  docker_available: boolean
  data_dir: string
}

function githubRepoFromUrl(
  repoUrl?: string | null
): { label: string; href: string } | null {
  if (!repoUrl) return null
  const trimmed = repoUrl.trim()
  if (!trimmed.includes('github.com')) return null

  // Normalize and strip .git suffix
  let cleaned = trimmed.replace(/\.git$/i, '')

  // SSH form: git@github.com:org/repo
  if (cleaned.startsWith('git@github.com:')) {
    const path = cleaned.split(':')[1] ?? ''
    const parts = path.replace(/\/+$/, '').split('/')
    if (parts.length >= 2) {
      const label = `${parts[0]}/${parts[1]}`
      return { label, href: `https://github.com/${label}` }
    }
    return null
  }

  // HTTPS form: https://github.com/org/repo
  try {
    const url = new URL(cleaned)
    const parts = url.pathname.replace(/^\/|\/$/g, '').split('/')
    if (url.hostname.endsWith('github.com') && parts.length >= 2) {
      const label = `${parts[0]}/${parts[1]}`
      return { label, href: `https://github.com/${label}` }
    }
  } catch {
    // Fall through – not a standard URL, ignore
  }

  return null
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [instance, setInstance] = useState<InstanceInfo | null>(null)
  const [servers, setServers] = useState<Server[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const [dash, instanceInfo, serverList, projectList, appList] = await Promise.all([
        api<DashboardSummary>('/api/dashboard'),
        api<InstanceInfo>('/api/instance'),
        api<Server[]>('/api/servers'),
        api<Project[]>('/api/projects'),
        api<Application[]>('/api/applications'),
      ])
      setSummary(dash)
      setInstance(instanceInfo)
      setServers(serverList)
      setProjects(projectList)
      setApplications(appList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const activeServer = servers.find((s) => s.is_active) ?? null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <PageHeader
        title="Dashboard"
        description="Your apps, deployments, and infrastructure."
      />
      <PageMain className="space-y-6">
        {loading || (!summary && !error) ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchDashboard}>
              Retry
            </Button>
          </div>
        ) : (
          <>

            {/* Summary cards */}
            <section className="grid gap-4 md:grid-cols-3">
              <Card className="border-zinc-800/80 bg-zinc-900/70">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Instance
                </h2>
                <div className="mt-3 space-y-1 text-xs text-zinc-400">
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Version</span>
                    <span className="font-mono text-zinc-200">
                      {instance?.version ?? '…'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-zinc-500">Docker</span>
                    <span className="font-mono text-zinc-200">
                      {instance
                        ? instance.docker_available
                          ? 'available'
                          : 'unavailable'
                        : '…'}
                    </span>
                  </div>
                </div>
              </Card>
              <Card className="border-zinc-800/80 bg-zinc-900/70">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Servers
                </h2>
                <p className="mt-2 text-xs text-zinc-500">
                  {activeServer
                    ? `Active: ${activeServer.name} (${activeServer.address})`
                    : 'No active server selected yet.'}
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-medium text-zinc-200 hover:border-emerald-500 hover:text-emerald-400"
                    onClick={() => navigate('/servers')}
                  >
                    Manage servers
                  </button>
                </div>
              </Card>
              <Card className="border-zinc-800/80 bg-zinc-900/70">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Apps &amp; deployments
                </h2>
                <p className="mt-2 text-xs text-zinc-500">
                  {summary.application_count} app(s), {summary.deployment_count} deployment(s).
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="cursor-pointer rounded-md border border-zinc-700 px-3 py-1.5 text-[11px] font-medium text-zinc-200 hover:border-emerald-500 hover:text-emerald-400"
                    onClick={() => navigate('/projects')}
                  >
                    View apps
                  </button>
                </div>
              </Card>
            </section>
            {/* Primary: Apps (projects) + Recent deployments */}
            <section className="grid gap-6 xl:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-100">Your apps</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-emerald-400"
                      onClick={() => navigate('/projects')}
                    >
                      View all
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-emerald-400"
                      onClick={() => navigate('/projects/new')}
                    >
                      New app
                    </button>
                  </div>
                </div>
                {projects.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-4 py-6 text-xs text-zinc-500">
                    No apps yet. Create a project to add environments and deploy.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {projects.slice(0, 4).map((p) => (
                      <Link
                        key={p.id}
                        to={`/projects/${p.id}`}
                        className="block cursor-pointer"
                      >
                        <ProjectCard project={p} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-100">
                    Recent deployments
                  </h2>
                </div>
                {summary.recent_deployments.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-4 py-6 text-xs text-zinc-500">
                    No deployments yet. Deploy an application from an app to see activity here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {summary.recent_deployments.slice(0, 6).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => navigate(`/deployments/${d.id}`)}
                        className="w-full cursor-pointer text-left"
                      >
                        <Card className="flex items-center justify-between border-zinc-800/80 bg-zinc-900/70 px-4 py-3 hover:border-emerald-500 hover:bg-zinc-800/80">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-zinc-100">
                                {d.application_name}
                              </span>
                              {d.application_domain && (
                                <span className="hidden shrink-0 text-[11px] text-zinc-500 sm:inline">
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
                          <Badge variant={statusToBadgeVariant(d.status)} className="shrink-0 ml-2">
                            {d.status}
                          </Badge>
                        </Card>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>


            {/* Servers + Applications lists */}
            <section className="grid gap-4 grid-cols-1 xl:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-100">Servers</h2>
                  <button
                    type="button"
                    className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-emerald-400"
                    onClick={() => navigate('/servers')}
                  >
                    View all
                  </button>
                </div>
                {servers.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-4 py-6 text-xs text-zinc-500">
                    No servers. Add one to deploy to remote hosts.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {servers.slice(0, 2).map((s) => (
                      <ServerCard
                        key={s.id}
                        server={s}
                        onClick={() => navigate(`/servers/${s.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-100">Applications</h2>
                  <button
                    type="button"
                    className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-emerald-400"
                    onClick={() => navigate('/projects')}
                  >
                    View all
                  </button>
                </div>
                {applications.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-4 py-6 text-xs text-zinc-500">
                    No applications yet. Add an app, environment, and application to deploy.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {applications.slice(0, 4).map((a) => (
                      <Card
                        key={a.id}
                        className="relative overflow-hidden border-zinc-800/80 bg-zinc-900/70 px-0 py-0 transition-colors hover:border-emerald-500 hover:bg-zinc-800/80"
                      >
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left"
                          onClick={() => navigate(`/applications/${a.id}`)}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center text-sm font-medium text-zinc-100">
                              <span
                                className={`mr-2 inline-block h-2 w-2 shrink-0 rounded-full ${
                                  a.status === 'running' ? 'bg-emerald-400' : 'bg-zinc-600'
                                }`}
                              />
                              <span className="truncate max-w-[180px]">{a.name}</span>
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              <span className="font-mono break-all">{a.image}</span>
                              <span> → :</span>
                              <span className="font-mono">{a.port}</span>
                            </div>
                            {githubRepoFromUrl(a.repo_url) && (
                              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                                <GithubIcon className="mr-0 h-3.5 w-3.5 text-zinc-400" />
                                {(() => {
                                  const repo = githubRepoFromUrl(a.repo_url)
                                  if (!repo) return null
                                  return (
                                    <a
                                      href={repo.href}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="truncate max-w-[180px] hover:text-emerald-400 hover:underline underline-offset-2"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {repo.label}
                                    </a>
                                  )
                                })()}
                                {a.repo_branch && (
                                  <span className="truncate max-w-[80px] text-zinc-600">
                                    ({a.repo_branch})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 shrink-0 ml-2">
                            <span className="text-zinc-400">ID:</span>{' '}
                            <span className="font-mono">{a.id.slice(0, 8)}</span>
                          </div>
                        </button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </PageMain>
    </div>
  )
}
