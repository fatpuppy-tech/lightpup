import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Badge } from '../components/atoms/Badge'
import { Button } from '../components/atoms/Button'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import type { Deployment } from '../lib/api'
import { api, formatDateTime, statusToBadgeVariant } from '../lib/api'

export function DeploymentDetailPage() {
  const { deploymentId } = useParams()
  const navigate = useNavigate()
  const [deployment, setDeployment] = useState<Deployment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!deploymentId) return
    setError(null)
    ;(async () => {
      try {
        const d = await api<Deployment>(`/api/deployments/${deploymentId}`)
        setDeployment(d)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deployment.')
      } finally {
        setLoading(false)
      }
    })()
  }, [deploymentId, retryCount])

  const deploymentInProgress =
    deployment?.status === 'pending' || deployment?.status === 'running'
  useEffect(() => {
    if (!deploymentId || !deploymentInProgress) return
    const interval = setInterval(async () => {
      try {
        const d = await api<Deployment>(`/api/deployments/${deploymentId}`)
        setDeployment(d)
      } catch {
        // ignore poll errors
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [deploymentId, deploymentInProgress])

  if (!deploymentId) return null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={() => navigate(-1)} trail="Deployment" />
        {deployment && (
          <Badge variant={statusToBadgeVariant(deployment.status)}>
            {deployment.status}
          </Badge>
        )}
      </header>
      <PageMain className="max-w-4xl space-y-4">
        {loading && !deployment && !error ? (
          <div className="py-10 text-sm text-zinc-500">Loading deployment…</div>
        ) : error ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={() => setRetryCount((c) => c + 1)}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <Card className="border-zinc-800/80 bg-zinc-900/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-base font-semibold text-zinc-100">
                    Deployment v{deployment.version}
                  </h1>
                  <p className="mt-1 text-xs text-zinc-500">
                    Application ID{' '}
                    <span className="font-mono text-zinc-300">
                      {deployment.application_id}
                    </span>
                  </p>
                </div>
                <div className="text-right text-[11px] text-zinc-500 space-y-1">
                  <div>
                    <span className="text-zinc-400">Started:</span>{' '}
                    <span className="font-mono text-zinc-200">
                      {formatDateTime(deployment.started_at)}
                    </span>
                  </div>
                  {deployment.finished_at && (
                    <div>
                      <span className="text-zinc-400">Finished:</span>{' '}
                      <span className="font-mono text-zinc-200">
                        {formatDateTime(deployment.finished_at)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="text-zinc-400">Status:</span>
                <Badge variant={statusToBadgeVariant(deployment.status)}>
                  {deployment.status}
                </Badge>
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/applications/${deployment.application_id}`)}
                >
                  View application
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Logs
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const text = deployment.logs || 'No logs available.'
                      await navigator.clipboard.writeText(text)
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const text = deployment.logs || 'No logs available.'
                      const blob = new Blob([text], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `deployment-${deployment.id}-logs.txt`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    Download
                  </Button>
                </div>
              </div>
              <pre className="max-h-[28rem] overflow-y-auto rounded-md bg-black p-3 text-xs text-zinc-300">
                {deployment.logs || 'No logs available.'}
              </pre>
            </Card>
          </>
        )}
      </PageMain>
    </div>
  )
}

