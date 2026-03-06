import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Badge } from '../components/atoms/Badge'
import { Button } from '../components/atoms/Button'
import { ConfirmModal } from '../components/molecules/ConfirmModal'
import { Breadcrumbs } from '../components/molecules/Breadcrumbs'
import { Tabs } from '../components/molecules/Tabs'
import { PageMain } from '../components/layout/PageMain'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import type {
  Application,
  Deployment,
  Environment,
  EnvVarItem,
  Project,
  ScheduledJob,
} from '../lib/api'
import {
  api,
  canEdit,
  deleteApplicationEnv,
  formatDateTime,
  getEnvironment,
  listApplicationEnv,
  setApplicationEnv,
  statusToBadgeVariant,
} from '../lib/api'
import { ApplicationForm } from '../components/organisms/ApplicationForm'

type TabKey = 'summary' | 'settings' | 'deployments' | 'cron'

export function ApplicationDetailPage() {
  const { appId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [app, setApp] = useState<Application | null>(null)
  const [env, setEnv] = useState<Environment | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [deploys, setDeploys] = useState<Deployment[]>([])
  const [selectedLogs, setSelectedLogs] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [deploying, setDeploying] = useState(false)
  const [releasingId, setReleasingId] = useState<string | null>(null)
  const [confirmDeployOpen, setConfirmDeployOpen] = useState(false)
  const [cronJobs, setCronJobs] = useState<ScheduledJob[]>([])
  const [cronName, setCronName] = useState('')
  const [cronExpression, setCronExpression] = useState('0 * * * *')
  const [cronSaving, setCronSaving] = useState(false)
  const [envVars, setEnvVars] = useState<EnvVarItem[]>([])
  const [envKey, setEnvKey] = useState('')
  const [envValue, setEnvValue] = useState('')
  const [envAdding, setEnvAdding] = useState(false)
  const [envDeletingKey, setEnvDeletingKey] = useState<string | null>(null)
  const { user } = useAuth()
  const { toast } = useToast()
  const editable = canEdit(user)

  const initialTab = (searchParams.get('tab') as TabKey | null) ?? 'summary'
  const [tab, setTab] = useState<TabKey>(initialTab)

  useEffect(() => {
    let next = (searchParams.get('tab') as TabKey | null) ?? 'summary'
    if (!editable && (next === 'settings' || next === 'cron')) {
      next = 'summary'
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', 'summary')
        return params
      })
    }
    setTab(next)
  }, [searchParams, editable, setSearchParams])

  useEffect(() => {
    if (!appId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setEnv(null)
    setProject(null)
    ;(async () => {
      try {
        const [appRes, deployRes] = await Promise.all([
          api<Application>(`/api/applications/${appId}`),
          api<Deployment[]>(`/api/applications/${appId}/deployments`),
        ])
        if (cancelled) return
        setApp(appRes)
        setDeploys(deployRes)
        const envRes = await getEnvironment(appRes.environment_id)
        if (cancelled) return
        setEnv(envRes)
        const projRes = await api<Project>(`/api/projects/${envRes.project_id}`)
        if (cancelled) return
        setProject(projRes)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load application.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [appId, retryCount])

  const hasDeployInProgress = deploys.some(
    (d) => d.status === 'pending' || d.status === 'running',
  )
  useEffect(() => {
    if (!appId || !hasDeployInProgress) return
    const interval = setInterval(async () => {
      try {
        const list = await api<Deployment[]>(`/api/applications/${appId}/deployments`)
        setDeploys(list)
      } catch {
        // ignore poll errors
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [appId, hasDeployInProgress])

  useEffect(() => {
    if (!appId || tab !== 'cron') return
    let cancelled = false
    api<ScheduledJob[]>(`/api/applications/${appId}/cron-jobs`)
      .then(setCronJobs)
      .catch(() => {
        if (!cancelled) setCronJobs([])
      })
    return () => {
      cancelled = true
    }
  }, [appId, tab])

  useEffect(() => {
    if (!appId || tab !== 'settings') return
    let cancelled = false
    listApplicationEnv(appId)
      .then(setEnvVars)
      .catch(() => {
        if (!cancelled) setEnvVars([])
      })
    return () => {
      cancelled = true
    }
  }, [appId, tab])

  if (!appId) return null

  function switchTab(next: TabKey) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('tab', next)
      return params
    })
  }

  async function doDeploy() {
    if (!appId) return
    setDeploying(true)
    try {
      await api(`/api/applications/${appId}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ version: 'latest' }),
      })
      const refreshed = await api<Deployment[]>(`/api/applications/${appId}/deployments`)
      setDeploys(refreshed)
      setConfirmDeployOpen(false)
      toast('Deployment started. Check the Deployments tab for status and logs.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Deployment failed', 'error')
    } finally {
      setDeploying(false)
    }
  }

  async function doRelease(deploymentId: string) {
    if (!appId) return
    setReleasingId(deploymentId)
    try {
      await api(`/api/applications/${appId}/release`, {
        method: 'POST',
        body: JSON.stringify({ deployment_id: deploymentId }),
      })
      const [appRes, deployRes] = await Promise.all([
        api<Application>(`/api/applications/${appId}`),
        api<Deployment[]>(`/api/applications/${appId}/deployments`),
      ])
      setApp(appRes)
      setDeploys(deployRes)
      toast('Release completed. Traffic is now on the selected version.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Release failed', 'error')
    } finally {
      setReleasingId(null)
    }
  }

  const latestDeployment = useMemo(
    () => (deploys.length > 0 ? deploys[0] : null),
    [deploys],
  )

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <ConfirmModal
        open={confirmDeployOpen}
        title="Start deployment"
        message="Start deployment for this application? You can check status and logs in the Deployments tab."
        confirmLabel="Start deployment"
        onConfirm={doDeploy}
        onCancel={() => setConfirmDeployOpen(false)}
        loading={deploying}
      />
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <Breadcrumbs
          items={[
            { label: 'Projects', href: '/projects' },
            ...(project
              ? [{ label: project.name, href: `/projects/${project.id}` }]
              : []),
            ...(env
              ? [{ label: env.name, href: `/environments/${env.id}` }]
              : []),
            { label: app?.name ?? 'Application' },
          ]}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => switchTab('settings')}
            disabled={!editable}
          >
            Edit settings
          </Button>
          <Button size="md" onClick={() => setConfirmDeployOpen(true)} disabled={deploying || !editable}>
            {deploying ? 'Deploying…' : 'Deploy'}
          </Button>
        </div>
      </header>

      <PageMain className="max-w-6xl space-y-4">
        {loading && !app && !error ? (
          <div className="py-10 text-sm text-zinc-500">Loading application…</div>
        ) : error ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
              Retry
            </Button>
          </div>
        ) : app ? (
          <>
            <Tabs
              variant="buttons"
              tabs={[
                { key: 'summary', label: 'Summary' },
                ...(editable ? [{ key: 'settings', label: 'Settings' }] : []),
                { key: 'deployments', label: 'Deployments' },
                ...(editable ? [{ key: 'cron', label: 'Cron jobs' }] : []),
              ]}
              activeKey={tab}
              onTabChange={(key) => switchTab(key as TabKey)}
              aria-label="Application tabs"
            />

            {tab === 'summary' && (
              <section className="space-y-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-zinc-100">
                        {app.name}
                      </h2>
                      {app.domain && (
                        <p className="mt-1 text-xs text-zinc-500">{app.domain}</p>
                      )}
                    </div>
                    <Badge variant={statusToBadgeVariant(app.status)}>
                      {app.status}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-4 text-xs text-zinc-400 md:grid-cols-3">
                    <div>
                      <div className="font-semibold text-zinc-300">Image</div>
                      <div className="mt-1 break-all">{app.image}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-300">Port</div>
                      <div className="mt-1">{app.port}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-300">
                        Repository
                      </div>
                      <div className="mt-1">
                        {app.repo_url ? (
                          <>
                            <div className="break-all">{app.repo_url}</div>
                            {app.repo_branch && (
                              <div className="mt-1 text-[11px] text-zinc-500">
                                Branch: {app.repo_branch}
                              </div>
                            )}
                            {app.dockerfile_path && (
                              <div className="mt-1 text-[11px] text-zinc-500">
                                Dockerfile: {app.dockerfile_path}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-zinc-500">Docker image only</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Latest deployment
                  </h3>
                  {latestDeployment ? (
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <div className="text-sm font-medium text-zinc-100">
                          v{latestDeployment.version}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-zinc-500">
                          <span>{formatDateTime(latestDeployment.started_at)}</span>
                          {latestDeployment.finished_at && (
                            <>
                              <span>•</span>
                              <span>
                                Finished {formatDateTime(latestDeployment.finished_at)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Badge variant={statusToBadgeVariant(latestDeployment.status)}>
                        {latestDeployment.status}
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      No deployments yet. Use the Deploy button to start one.
                    </p>
                  )}
                </Card>
              </section>
            )}

            {tab === 'settings' && (
              <section className="space-y-6">
                <Card className="p-4">
                  <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                    Application settings
                  </h2>
                  <ApplicationForm
                    initial={app}
                    disabled={!editable}
                    onSubmit={async (payload) => {
                      const updated = await api<Application>(`/api/applications/${appId}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload),
                      })
                      setApp(updated)
                    }}
                  />
                </Card>
                <Card className="p-4">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-100">
                    Environment variables
                  </h3>
                  <p className="mb-4 text-xs text-zinc-500">
                    Injected into this app&apos;s container at deploy. App vars override project-level vars with the same key.
                  </p>
                  <form
                    className="mb-4 flex flex-wrap items-end gap-3"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!appId || !envKey.trim()) return
                      setEnvAdding(true)
                      try {
                        const added = await setApplicationEnv(appId, envKey.trim(), envValue)
                        setEnvVars((prev) => {
                          const without = prev.filter((x) => x.key !== added.key)
                          return [...without, added].sort((a, b) => a.key.localeCompare(b.key))
                        })
                        setEnvKey('')
                        setEnvValue('')
                        toast('Variable added', 'success')
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Failed to add variable', 'error')
                      } finally {
                        setEnvAdding(false)
                      }
                    }}
                  >
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-400">Key</label>
                      <input
                        value={envKey}
                        onChange={(e) => setEnvKey(e.target.value)}
                        placeholder="e.g. API_URL"
                        className="w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-400">Value</label>
                      <input
                        value={envValue}
                        onChange={(e) => setEnvValue(e.target.value)}
                        placeholder="e.g. https://api.example.com"
                        className="w-52 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-500"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={!editable || !envKey.trim() || envAdding}>
                      {envAdding ? 'Adding…' : 'Add'}
                    </Button>
                  </form>
                  {envVars.length === 0 ? (
                    <p className="text-sm text-zinc-500">No app-level variables. Add keys above or use project settings for shared vars.</p>
                  ) : (
                    <ul className="space-y-2">
                      {envVars.map(({ key, value }) => (
                        <li
                          key={key}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-sm font-medium text-zinc-100">{key}</span>
                            <span className="ml-2 truncate font-mono text-xs text-zinc-500">{value}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!editable || envDeletingKey === key}
                            onClick={async () => {
                              if (!appId) return
                              setEnvDeletingKey(key)
                              try {
                                await deleteApplicationEnv(appId, key)
                                setEnvVars((prev) => prev.filter((x) => x.key !== key))
                                toast('Variable removed', 'success')
                              } catch (err) {
                                toast(err instanceof Error ? err.message : 'Failed to remove', 'error')
                              } finally {
                                setEnvDeletingKey(null)
                              }
                            }}
                          >
                            {envDeletingKey === key ? 'Removing…' : 'Remove'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </section>
            )}

            {tab === 'cron' && (
              <section className="space-y-4">
                <Card className="p-4">
                  <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                    Scheduled deploys (cron)
                  </h2>
                  <p className="mb-4 text-xs text-zinc-500">
                    Run a deploy on a schedule. Use 5-field cron: minute hour day month day-of-week (e.g. &quot;0 * * * *&quot; = hourly at :00).
                  </p>
                  <form
                    className="mb-4 flex flex-wrap items-end gap-3"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!appId || !cronName.trim() || !cronExpression.trim()) return
                      setCronSaving(true)
                      try {
                        const job = await api<ScheduledJob>(`/api/applications/${appId}/cron-jobs`, {
                          method: 'POST',
                          body: JSON.stringify({ name: cronName.trim(), cron_expression: cronExpression.trim() }),
                        })
                        setCronJobs((prev) => [job, ...prev])
                        setCronName('')
                        setCronExpression('0 * * * *')
                        toast('Cron job added.', 'success')
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Failed to add cron job', 'error')
                      } finally {
                        setCronSaving(false)
                      }
                    }}
                  >
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Name</label>
                      <input
                        value={cronName}
                        onChange={(e) => setCronName(e.target.value)}
                        placeholder="e.g. Hourly deploy"
                        className="w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Cron expression</label>
                      <input
                        value={cronExpression}
                        onChange={(e) => setCronExpression(e.target.value)}
                        placeholder="0 * * * *"
                        className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm font-mono text-zinc-100 outline-none focus:border-emerald-500"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={!editable || cronSaving || !cronName.trim() || !cronExpression.trim()}>
                      {cronSaving ? 'Adding…' : 'Add'}
                    </Button>
                  </form>
                  {cronJobs.length === 0 ? (
                    <p className="text-sm text-zinc-500">No cron jobs yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {cronJobs.map((job) => (
                        <li
                          key={job.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                        >
                          <div>
                            <span className="text-sm font-medium text-zinc-100">{job.name}</span>
                            <span className="ml-2 font-mono text-xs text-zinc-500">{job.cron_expression}</span>
                            {job.last_run_at && (
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                Last run: {formatDateTime(job.last_run_at)}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {job.enabled === 0 && (
                              <span className="text-[11px] text-zinc-500">Disabled</span>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!editable}
                              onClick={async () => {
                                try {
                                  await api(`/api/cron-jobs/${job.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ enabled: job.enabled ? false : true }),
                                  })
                                  setCronJobs((prev) =>
                                    prev.map((j) => (j.id === job.id ? { ...j, enabled: j.enabled ? 0 : 1 } : j))
                                  )
                                  toast(job.enabled ? 'Job disabled.' : 'Job enabled.', 'success')
                                } catch (err) {
                                  toast(err instanceof Error ? err.message : 'Failed to update', 'error')
                                }
                              }}
                            >
                              {job.enabled ? 'Disable' : 'Enable'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!editable}
                              onClick={async () => {
                                if (!confirm('Delete this cron job?')) return
                                try {
                                  await api(`/api/cron-jobs/${job.id}`, { method: 'DELETE' })
                                  setCronJobs((prev) => prev.filter((j) => j.id !== job.id))
                                  toast('Cron job deleted.', 'success')
                                } catch (err) {
                                  toast(err instanceof Error ? err.message : 'Failed to delete', 'error')
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </section>
            )}

            {tab === 'deployments' && (
              <section className="space-y-4">
                <Card className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-zinc-100">
                      Deployments
                    </h2>
                    <Button size="sm" onClick={() => setConfirmDeployOpen(true)} disabled={deploying || !editable}>
                      {deploying ? 'Deploying…' : 'Deploy'}
                    </Button>
                  </div>
                  {deploys.length === 0 ? (
                    <div className="py-6 text-sm text-zinc-500">
                      No deployments yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deploys.map((d) => (
                        <div
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 cursor-pointer text-left text-xs hover:opacity-90"
                            onClick={async () => {
                              const detail = await api<Deployment>(
                                `/api/deployments/${d.id}`,
                              )
                              setSelectedLogs(detail.logs || 'No logs available')
                            }}
                          >
                            <div className="text-sm font-medium text-zinc-100">
                              v{d.version}
                              {app?.live_deployment_id === d.id && (
                                <span className="ml-2 text-[10px] font-normal text-emerald-400">
                                  (live)
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-zinc-500">
                              <span>{formatDateTime(d.started_at)}</span>
                              {d.finished_at && (
                                <>
                                  <span>•</span>
                                  <span>
                                    Finished {formatDateTime(d.finished_at)}
                                  </span>
                                </>
                              )}
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <Badge variant={statusToBadgeVariant(d.status)}>
                              {d.status}
                            </Badge>
                            {d.status === 'success' && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={releasingId !== null || !editable}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  doRelease(d.id)
                                }}
                              >
                                {releasingId === d.id ? 'Releasing…' : 'Release'}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {selectedLogs && (
                  <Card className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-zinc-100">
                        Deployment logs
                      </h3>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await navigator.clipboard.writeText(selectedLogs)
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const blob = new Blob([selectedLogs], {
                              type: 'text/plain',
                            })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = 'deployment-logs.txt'
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                    <pre className="max-h-96 overflow-y-auto rounded-md bg-black p-3 text-xs text-zinc-300">
                      {selectedLogs}
                    </pre>
                  </Card>
                )}
              </section>
            )}
          </>
        ) : (
          <div className="py-10 text-sm text-zinc-500">Loading application…</div>
        )}
      </PageMain>
    </div>
  )
}

