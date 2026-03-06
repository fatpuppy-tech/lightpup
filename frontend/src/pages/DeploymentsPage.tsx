import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { Skeleton } from '../components/atoms/Skeleton'
import { Badge } from '../components/atoms/Badge'
import { EmptyState } from '../components/molecules/EmptyState'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import type { Deployment } from '../lib/api'
import { api } from '../lib/api'

const PAGE_SIZE = 20

type StatusFilter = 'all' | 'success' | 'failed' | 'pending' | 'running'

export function DeploymentsPage() {
  const { appId } = useParams()
  const navigate = useNavigate()
  const [deploys, setDeploys] = useState<Deployment[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedLogs, setSelectedLogs] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return deploys
    return deploys.filter((d) => d.status === statusFilter)
  }, [deploys, statusFilter])

  const fetchPage = useCallback(
    async (opts: {
      silent?: boolean
      offset?: number
      limit?: number
      append?: boolean
    } = {}) => {
      if (!appId) return
      const { silent = false, offset = 0, limit = PAGE_SIZE, append = false } = opts
      if (!silent) {
        if (append) setLoadingMore(true)
        else {
          setLoading(true)
          setError(null)
        }
      }
      try {
        const list = await api<Deployment[]>(
          `/api/applications/${appId}/deployments?limit=${limit}&offset=${offset}`,
        )
        setHasMore(list.length === PAGE_SIZE)
        if (append) {
          setDeploys((prev) => [...prev, ...list])
        } else {
          setDeploys(list)
        }
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Failed to load deployments.')
        }
      } finally {
        if (!silent) {
          if (append) setLoadingMore(false)
          else setLoading(false)
        }
      }
    },
    [appId],
  )

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  const loadMore = useCallback(() => {
    fetchPage({ append: true, offset: deploys.length })
  }, [fetchPage, deploys.length])

  const hasInProgress = deploys.some(
    (d) => d.status === 'pending' || d.status === 'running',
  )
  useEffect(() => {
    if (!hasInProgress || !appId || deploys.length === 0) return
    const interval = setInterval(() => {
      api<Deployment[]>(
        `/api/applications/${appId}/deployments?limit=${deploys.length}&offset=0`,
      )
        .then((list) => setDeploys(list))
        .catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [hasInProgress, appId, deploys.length])

  if (!appId) return null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={() => navigate(-1)} trail="Deployments" />
      </header>
      <PageMain className="max-w-3xl space-y-4">
        {!loading && deploys.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="deploy-status-filter" className="text-xs text-zinc-500">
              Status:
            </label>
            <select
              id="deploy-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
            </select>
          </div>
        )}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="flex items-center justify-between px-4 py-3">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-36" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchPage()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="deployment"
            title={
              deploys.length === 0
                ? 'No deployments yet'
                : `No ${statusFilter} deployments`
            }
            description={
              deploys.length === 0
                ? 'Deploy this application to see build and run history here.'
                : 'Try a different status filter.'
            }
          />
        ) : (
          filtered.map((d) => (
            <Card
              key={d.id}
              className="flex cursor-pointer items-center justify-between px-4 py-3 hover:border-emerald-500 hover:bg-zinc-900/80"
              onClick={async () => {
                const detail = await api<Deployment>(`/api/deployments/${d.id}`)
                setSelectedLogs(detail.logs || 'No logs available')
              }}
            >
              <div>
                <div className="text-sm font-medium text-zinc-100">
                  v{d.version}
                </div>
                <div className="text-xs text-zinc-500">
                  {new Date(d.started_at).toLocaleString()}
                </div>
              </div>
              <Badge
                variant={
                  d.status === 'success'
                    ? 'success'
                    : d.status === 'failed'
                      ? 'danger'
                      : 'warning'
                }
              >
                {d.status}
              </Badge>
            </Card>
          ))
        )}
        {!loading && !error && deploys.length > 0 && hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
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
                    const blob = new Blob([selectedLogs], { type: 'text/plain' })
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
      </PageMain>
    </div>
  )
}

