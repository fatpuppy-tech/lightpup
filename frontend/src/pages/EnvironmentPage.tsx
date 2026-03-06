import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { Badge } from '../components/atoms/Badge'
import { EmptyState } from '../components/molecules/EmptyState'
import { ConfirmModal } from '../components/molecules/ConfirmModal'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import { useToast } from '../contexts/ToastContext'
import type { Application, Deployment } from '../lib/api'
import { api, formatDateTime, statusToBadgeVariant } from '../lib/api'
import { GithubIcon } from '../components/atoms/NavIcons'

const ApplicationIconBg = () => (
  <svg
    className="h-32 w-32 text-zinc-700/25"
    viewBox="0 0 640 640"
    fill="currentColor"
    aria-hidden
  >
    <path d="M128 144C128 117.5 149.5 96 176 96H464C490.5 96 512 117.5 512 144V496C512 522.5 490.5 544 464 544H176C149.5 544 128 522.5 128 496V144ZM208 208C195.3 208 184 219.3 184 232C184 244.7 195.3 256 208 256H432C444.7 256 456 244.7 456 232C456 219.3 444.7 208 432 208H208ZM208 320C195.3 320 184 331.3 184 344C184 356.7 195.3 368 208 368H352C364.7 368 376 356.7 376 344C376 331.3 364.7 320 352 320H208Z" />
  </svg>
)

type LocationState = {
  envName?: string
  projectName?: string
  projectId?: string
}

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

export function EnvironmentPage() {
  const { envId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState
  const [apps, setApps] = useState<Application[]>([])
  const [latestByApp, setLatestByApp] = useState<Record<string, Deployment | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [confirmDeployApp, setConfirmDeployApp] = useState<Application | null>(null)
  const [deploying, setDeploying] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!envId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const list = await api<Application[]>(`/api/environments/${envId}/applications`)
        if (cancelled) return
        setApps(list)
        if (list.length === 0) {
          setLatestByApp({})
          return
        }
        const deployments = await Promise.all(
          list.map((a) =>
            api<Deployment[]>(`/api/applications/${a.id}/deployments`)
          )
        )
        if (cancelled) return
        const map: Record<string, Deployment | null> = {}
        list.forEach((a, i) => {
          const deploys = deployments[i] ?? []
          map[a.id] = deploys.length > 0 ? deploys[0] : null
        })
        setLatestByApp(map)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load environment.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [envId, retryCount])

  const trail =
    state.projectName && state.envName
      ? `${state.projectName} / ${state.envName}`
      : state.envName ?? 'Environment'
  const onBack = state.projectId
    ? () => navigate(`/projects/${state.projectId}`)
    : () => navigate(-1)

  async function doDeploy(appId: string) {
    setDeploying(true)
    try {
      await api(`/api/applications/${appId}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ version: 'latest' }),
      })
      setConfirmDeployApp(null)
      toast('Deployment started. Check the Deployments tab for status.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Deployment failed', 'error')
    } finally {
      setDeploying(false)
    }
  }

  if (!envId) return null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <ConfirmModal
        open={!!confirmDeployApp}
        title="Start deployment"
        message={
          confirmDeployApp
            ? `Start deployment for "${confirmDeployApp.name}"? You can check status in the application's Deployments tab.`
            : ''
        }
        confirmLabel="Start deployment"
        onConfirm={() => confirmDeployApp && doDeploy(confirmDeployApp.id)}
        onCancel={() => setConfirmDeployApp(null)}
        loading={deploying}
      />
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={onBack} trail={trail} />
        <Button
          size="md"
          onClick={() => navigate(`/environments/${envId}/applications/new`)}
        >
          Add application
        </Button>
      </header>
      <PageMain>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Applications
        </h3>
        {loading && !error ? (
          <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>
        ) : error ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
              Retry
            </Button>
          </div>
        ) : apps.length === 0 ? (
          <EmptyState
            icon="app"
            title="No applications yet"
            description="Add an application to deploy and run in this environment."
            action={
              <Button
                size="md"
                onClick={() => navigate(`/environments/${envId}/applications/new`)}
              >
                Add application
              </Button>
            }
          />
        ) : (
          apps.map((a) => {
            const latest = latestByApp[a.id]
            return (
              <Card
                key={a.id}
                className="relative mb-2 overflow-hidden border-zinc-800/80 bg-zinc-900/70 px-0 py-0 transition-colors hover:border-emerald-500 hover:bg-zinc-800/80"
              >
                <div
                  className="pointer-events-none absolute -bottom-10 -right-10"
                  aria-hidden
                >
                  <ApplicationIconBg />
                </div>
                <div className="relative flex items-center justify-between px-4 py-3">
                  <button
                    type="button"
                    className="flex cursor-pointer flex-col items-start text-left"
                    onClick={() => navigate(`/applications/${a.id}`)}
                  >
                    <h4 className="flex items-center text-sm font-medium text-zinc-100">
                      <span
                        className={`mr-2 inline-block h-2 w-2 rounded-full ${
                          a.status === 'running' ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                      />
                      {a.name}
                    </h4>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span className="font-mono">
                        {a.image} → :{a.port}
                      </span>
                      {githubRepoFromUrl(a.repo_url) && (
                        <>
                          <span>•</span>
                          {(() => {
                            const repo = githubRepoFromUrl(a.repo_url)
                            if (!repo) return null
                            const isDockerfileApp = !!a.dockerfile_path
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
                                {isDockerfileApp && (
                                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                                    Dockerfile
                                  </span>
                                )}
                              </span>
                            )
                          })()}
                        </>
                      )}
                    </div>
                    {latest && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                        <span>Last deployment: v{latest.version}</span>
                        <Badge variant={statusToBadgeVariant(latest.status)}>
                          {latest.status}
                        </Badge>
                        <span>{formatDateTime(latest.started_at)}</span>
                      </div>
                    )}
                  </button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/applications/${a.id}?tab=deployments`)}
                    >
                      Deployments
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmDeployApp(a)}
                      disabled={deploying}
                    >
                      Deploy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/applications/${a.id}?tab=settings`)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })
        )}
      </PageMain>
    </div>
  )
}
