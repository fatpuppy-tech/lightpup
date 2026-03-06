import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Badge } from '../components/atoms/Badge'
import { Button } from '../components/atoms/Button'
import { ConfirmModal } from '../components/molecules/ConfirmModal'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { Tabs } from '../components/molecules/Tabs'
import { PageMain } from '../components/layout/PageMain'
import { useToast } from '../contexts/ToastContext'
import type { Application, Deployment } from '../lib/api'
import { api, formatDateTime, statusToBadgeVariant } from '../lib/api'
import { ApplicationForm } from '../components/organisms/ApplicationForm'

type TabKey = 'summary' | 'settings' | 'deployments'

export function ApplicationDetailPage() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [app, setApp] = useState<Application | null>(null)
  const [deploys, setDeploys] = useState<Deployment[]>([])
  const [selectedLogs, setSelectedLogs] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [deploying, setDeploying] = useState(false)
  const [confirmDeployOpen, setConfirmDeployOpen] = useState(false)
  const { toast } = useToast()

  const initialTab = (searchParams.get('tab') as TabKey | null) ?? 'summary'
  const [tab, setTab] = useState<TabKey>(initialTab)

  useEffect(() => {
    const next = (searchParams.get('tab') as TabKey | null) ?? 'summary'
    setTab(next)
  }, [searchParams])

  useEffect(() => {
    if (!appId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [appRes, deployRes] = await Promise.all([
          api<Application>(`/api/applications/${appId}`),
          api<Deployment[]>(`/api/applications/${appId}/deployments`),
        ])
        if (cancelled) return
        setApp(appRes)
        setDeploys(deployRes)
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
        <PageHeaderBack
          onBack={() => navigate(-1)}
          trail={app?.name ?? 'Application'}
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() => switchTab('settings')}
          >
            Edit settings
          </Button>
          <Button size="md" onClick={() => setConfirmDeployOpen(true)} disabled={deploying}>
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
                { key: 'settings', label: 'Settings' },
                { key: 'deployments', label: 'Deployments' },
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
              <section>
                <Card className="p-4">
                  <h2 className="mb-4 text-sm font-semibold text-zinc-100">
                    Application settings
                  </h2>
                  <ApplicationForm
                    initial={app}
                    onSubmit={async (payload) => {
                      const updated = await api<Application>(`/api/applications/${appId}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload),
                      })
                      setApp(updated)
                    }}
                  />
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
                    <Button size="sm" onClick={() => setConfirmDeployOpen(true)} disabled={deploying}>
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
                        <button
                          key={d.id}
                          type="button"
                          className="flex w-full cursor-pointer items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left text-xs hover:border-zinc-700"
                          onClick={async () => {
                            const detail = await api<Deployment>(
                              `/api/deployments/${d.id}`,
                            )
                            setSelectedLogs(detail.logs || 'No logs available')
                          }}
                        >
                          <div>
                            <div className="text-sm font-medium text-zinc-100">
                              v{d.version}
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
                          </div>
                          <Badge variant={statusToBadgeVariant(d.status)}>
                            {d.status}
                          </Badge>
                        </button>
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

