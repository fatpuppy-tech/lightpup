import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Input } from '../components/atoms/Input'
import { CardSkeleton } from '../components/molecules/CardSkeleton'
import { EmptyState } from '../components/molecules/EmptyState'
import { PageHeader } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import { ServerCard } from '../components/molecules/ServerCard'
import { useAsyncData } from '../hooks/useAsyncData'
import type { Server } from '../lib/api'
import { api } from '../lib/api'

export function ServersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const { data, loading, error, retry } = useAsyncData(
    () => api<Server[]>('/api/servers'),
    []
  )
  const servers = data ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return servers
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q),
    )
  }, [servers, search])

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <PageHeader
        title="Servers"
        description="Define where LightPup deploys and where the built‑in proxy should route traffic."
        actions={
          <Button onClick={() => navigate('/servers/new')} size="md">
            Add server
          </Button>
        }
      />
      <PageMain className="max-w-6xl space-y-4">
        {!loading && servers.length > 0 && (
          <div className="max-w-xs">
            <Input
              type="search"
              placeholder="Search servers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
        )}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="server"
            title={servers.length === 0 ? 'No servers yet' : 'No matching servers'}
            description={
              servers.length === 0
                ? 'Add your first server (localhost or a remote host) to deploy and run applications.'
                : 'Try a different search.'
            }
            action={
              servers.length === 0 ? (
                <Button onClick={() => navigate('/servers/new')} size="md">
                  Add server
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onClick={() => navigate(`/servers/${server.id}`)}
              />
            ))}
          </div>
        )}

      </PageMain>
    </div>
  )
}

