import { useEffect, useState } from 'react'
import { Card } from '../../components/atoms/Card'
import { api } from '../../lib/api'

type InstanceInfo = {
  version: string
  docker_available: boolean
  data_dir: string
}

export function SettingsGeneralTab() {
  const [info, setInfo] = useState<InstanceInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<InstanceInfo>('/api/instance')
      .then(setInfo)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4 pt-4">
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Instance
          </h2>
          <div className="mt-3 space-y-1 text-xs text-zinc-400">
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">Version</span>
              <span className="font-mono text-zinc-200">
                {loading || !info ? '…' : info.version}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500">Docker</span>
              <span className="font-mono text-zinc-200">
                {loading || !info ? '…' : info.docker_available ? 'available' : 'unavailable'}
              </span>
            </div>
          </div>
        </Card>
        <Card className="md:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Storage
          </h2>
          <p className="mt-2 text-xs text-zinc-500">
            Application metadata, deployments, and settings are stored in a SQLite database on the
            host running this instance.
          </p>
          <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-300">
            <div className="text-zinc-500">Data directory</div>
            <div className="mt-1 font-mono">
              {loading || !info ? '…' : info.data_dir}
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Proxy
          </h3>
          <p className="mt-2 text-xs text-zinc-500">
            The built‑in HTTP proxy routes incoming domains to running applications on this host.
            Configure application domains on the application detail pages. For local development,
            requests to <span className="font-mono">localhost</span> are redirected to the UI.
          </p>
        </Card>
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Servers and Docker
          </h3>
          <p className="mt-2 text-xs text-zinc-500">
            Deployments target the active server configured on the Servers page. For local
            deployments, ensure the Docker daemon is reachable by this process. Remote servers use
            SSH with your configured user and key.
          </p>
        </Card>
      </section>

      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Configuration files & environment
        </h3>
        <p className="mt-2 text-xs text-zinc-500">
          Advanced settings such as logging, ports, TLS certificates, and Git authentication are
          managed via environment variables and configuration files on the host. Updating those
          values typically requires restarting the LightPup process.
        </p>
      </Card>
    </div>
  )
}
