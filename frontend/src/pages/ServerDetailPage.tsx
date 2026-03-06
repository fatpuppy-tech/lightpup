import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Label } from '../components/atoms/Label'
import { Input } from '../components/atoms/Input'
import { Button } from '../components/atoms/Button'
import { ConfirmModal } from '../components/molecules/ConfirmModal'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { Tabs } from '../components/molecules/Tabs'
import { PageMain } from '../components/layout/PageMain'
import { useTerminalOverlay } from '../contexts/TerminalOverlayContext'
import type { Server } from '../lib/api'
import { api, formatDateTime } from '../lib/api'
import { loadJson, saveJson } from '../lib/storage'
import { terminalTheme } from '../lib/terminalTheme'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

type TabKey = 'general' | 'deployments' | 'proxy' | 'terminal' | 'danger'

type ServerUiConfig = {
  ssh_port: number
  ssh_connect_timeout_sec: number
  ssh_keepalive_interval_sec: number
  ssh_strict_host_key_checking: boolean
  max_concurrent_deploys: number
  deploy_root_dir: string
  docker_context: string
  notes: string
}

const DEFAULT_UI: ServerUiConfig = {
  ssh_port: 22,
  ssh_connect_timeout_sec: 10,
  ssh_keepalive_interval_sec: 30,
  ssh_strict_host_key_checking: true,
  max_concurrent_deploys: 1,
  deploy_root_dir: '',
  docker_context: '',
  notes: '',
}

function advancedKeyForServer(serverId: string) {
  return `lightpup.ui.server.${serverId}.advanced`
}

function mergeUiConfig(partial: Partial<ServerUiConfig> | null | undefined) {
  return { ...DEFAULT_UI, ...(partial ?? {}) }
}

export function ServerDetailPage() {
  const { serverId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [server, setServer] = useState<Server | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [sshKeyContent, setSshKeyContent] = useState('')
  const [useKeyContent, setUseKeyContent] = useState(false)
  const [uiConfig, setUiConfig] = useState<ServerUiConfig>(DEFAULT_UI)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const terminalContainerRef = useRef<HTMLDivElement | null>(null)
  const [terminalReady, setTerminalReady] = useState(false)

  const initialTab = (searchParams.get('tab') as TabKey | null) ?? 'general'
  const [tab, setTab] = useState<TabKey>(initialTab)
  const { openTerminal: openTerminalOverlay } = useTerminalOverlay()

  useEffect(() => {
    const next = (searchParams.get('tab') as TabKey | null) ?? 'general'
    setTab(next)
  }, [searchParams])

  useEffect(() => {
    if (!serverId) return
    api<Server>(`/api/servers/${serverId}`).then((s) => {
      setServer(s)
      setName(s.name)
      setAddress(s.address)
      setSshUser(s.ssh_user ?? '')
      setSshKeyPath(s.ssh_key_path ?? '')
      setSshKeyContent('')
      setUseKeyContent(false)
      const stored = loadJson<Partial<ServerUiConfig>>(advancedKeyForServer(s.id), {})
      setUiConfig(mergeUiConfig(stored))
    })
  }, [serverId])

  if (!serverId) return null

  const isLocalhost = address.toLowerCase() === 'localhost' || address === '127.0.0.1'

  useEffect(() => {
    if (!serverId) return
    saveJson(advancedKeyForServer(serverId), uiConfig)
  }, [uiConfig, serverId])

  function switchTab(next: TabKey) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      params.set('tab', next)
      return params
    })
  }

  async function save() {
    if (!serverId) return
    setSaving(true)
    try {
      const updated = await api<Server>(`/api/servers/${serverId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          address,
          ssh_user: isLocalhost ? null : sshUser,
          ssh_key_path: isLocalhost ? null : (useKeyContent ? null : sshKeyPath),
          ssh_key_content:
            isLocalhost || !useKeyContent ? null : (sshKeyContent.trim() ? sshKeyContent : null),
        }),
      })
      setServer(updated)
      setSshKeyContent('')
      setUseKeyContent(false)
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!serverId || !server) return
    setSaving(true)
    try {
      const updated = await api<Server>(`/api/servers/${serverId}`, {
        method: 'PUT',
        body: JSON.stringify({
          is_active: !server.is_active,
        }),
      })
      setServer(updated)
    } finally {
      setSaving(false)
    }
  }

  async function doDelete() {
    if (!serverId) return
    setDeleting(true)
    try {
      await api(`/api/servers/${serverId}`, { method: 'DELETE' })
      setConfirmDeleteOpen(false)
      navigate('/servers')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (tab !== 'terminal' || !serverId || !server) return

    const container = terminalContainerRef.current
    if (!container) return
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      theme: { ...terminalTheme },
      cursorBlink: true,
      scrollback: 2000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()
    setTerminalReady(true)

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // In dev, the frontend runs on 5173 and the backend on 3000.
    // Connect directly to the backend for WebSocket traffic.
    const host =
      window.location.port === '5173'
        ? 'localhost:3000'
        : window.location.host
    const wsUrl = `${proto}://${host}/api/servers/${serverId}/terminal/ws`
    const socket = new WebSocket(wsUrl)

    socket.binaryType = 'arraybuffer'

    socket.addEventListener('open', () => {
      term.focus()
    })

    socket.addEventListener('message', (event) => {
      if (event.data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(new Uint8Array(event.data))
        term.write(text)
      } else if (typeof event.data === 'string') {
        term.write(event.data)
      }
    })

    socket.addEventListener('close', () => {
      term.write('\r\n\x1b[31m[disconnected]\x1b[0m\r\n')
    })

    const onData = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data)
      }
    })

    const handleResize = () => {
      fitAddon.fit()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      setTerminalReady(false)
      window.removeEventListener('resize', handleResize)
      onData.dispose()
      term.dispose()
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    }
  }, [tab, serverId, server])

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <ConfirmModal
        open={confirmDeleteOpen}
        title="Remove server"
        message="Remove this server? Deployments will no longer target it. This cannot be undone."
        confirmLabel="Remove server"
        cancelLabel="Cancel"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
        variant="danger"
        loading={deleting}
      />
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={() => navigate('/servers')} trail={server?.name ?? 'Server'} />
        <div className="flex gap-2">
          <Button
            variant={server?.is_active ? 'secondary' : 'outline'}
            size="sm"
            onClick={toggleActive}
            disabled={!server || saving}
          >
            {server?.is_active ? 'Disable' : 'Mark active'}
          </Button>
        </div>
      </header>
      <PageMain className="max-w-6xl space-y-4">
        {!server ? (
          <div className="py-10 text-sm text-zinc-500">Loading server…</div>
        ) : (
          <>
            <Tabs
              variant="buttons"
              tabs={[
                { key: 'general', label: 'General' },
                { key: 'deployments', label: 'Deployments' },
                { key: 'proxy', label: 'Proxy' },
                { key: 'terminal', label: 'Terminal' },
                { key: 'danger', label: 'Danger zone' },
              ]}
              activeKey={tab}
              onTabChange={(key) => switchTab(key as TabKey)}
              aria-label="Server tabs"
            />

            {tab === 'general' && (
              <section className="space-y-4">
                <Card className="p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Name</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="localhost"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Host / IP</Label>
                      <Input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="10.0.0.5 or example.com"
                      />
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Hostname or IP address of the Docker host. For local Docker, use{' '}
                        <code className="rounded bg-zinc-900 px-1 py-0.5 text-[10px]">localhost</code>.
                      </p>
                    </div>
                  </div>

                  {isLocalhost ? (
                    <div className="p-3 bg-zinc-900 rounded border border-zinc-800">
                      <p className="text-xs text-zinc-400">
                        ✓ Localhost detected - SSH not required. The server will use the local Docker daemon.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label>SSH username (optional)</Label>
                          <Input
                            value={sshUser}
                            onChange={(e) => setSshUser(e.target.value)}
                            placeholder="deploy"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="useKeyContentEdit"
                            checked={useKeyContent}
                            onChange={(e) => setUseKeyContent(e.target.checked)}
                            className="rounded bg-zinc-800 border-zinc-700"
                          />
                          <Label htmlFor="useKeyContentEdit" className="text-zinc-300! m-0">
                            Paste private key directly
                          </Label>
                        </div>

                        {useKeyContent ? (
                          <div className="space-y-1">
                            <Label>SSH Private Key</Label>
                            <textarea
                              value={sshKeyContent}
                              onChange={(e) => setSshKeyContent(e.target.value)}
                              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                              className="w-full h-32 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300 resize-y"
                            />
                            <p className="text-[11px] text-zinc-500">
                              For safety, the stored key is never displayed again. Paste a new one here to replace it.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <Label>SSH key path (optional)</Label>
                            <Input
                              value={sshKeyPath}
                              onChange={(e) => setSshKeyPath(e.target.value)}
                              placeholder="~/.ssh/id_ed25519"
                            />
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {!isLocalhost && (
                    <div className="border-t border-zinc-800/80 pt-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-100">
                            Connection options (UI-only for now)
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            Saved in your browser for this server and won’t affect connections yet.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setUiConfig((prev) => ({
                              ...prev,
                              ssh_port: DEFAULT_UI.ssh_port,
                              ssh_connect_timeout_sec: DEFAULT_UI.ssh_connect_timeout_sec,
                              ssh_keepalive_interval_sec: DEFAULT_UI.ssh_keepalive_interval_sec,
                              ssh_strict_host_key_checking: DEFAULT_UI.ssh_strict_host_key_checking,
                            }))
                          }
                        >
                          Reset
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 text-xs">
                        <div className="space-y-1">
                          <Label>SSH port</Label>
                          <Input
                            type="number"
                            min={1}
                            max={65535}
                            value={uiConfig.ssh_port}
                            onChange={(e) =>
                              setUiConfig((prev) => ({
                                ...prev,
                                ssh_port: Math.max(
                                  1,
                                  Number.parseInt(e.target.value || '22', 10),
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 text-xs">
                        <div className="space-y-1">
                          <Label>SSH connect timeout (sec)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={300}
                            value={uiConfig.ssh_connect_timeout_sec}
                            onChange={(e) =>
                              setUiConfig((prev) => ({
                                ...prev,
                                ssh_connect_timeout_sec: Math.max(
                                  1,
                                  Number.parseInt(e.target.value || '10', 10),
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>SSH keepalive interval (sec)</Label>
                          <Input
                            type="number"
                            min={0}
                            max={300}
                            value={uiConfig.ssh_keepalive_interval_sec}
                            onChange={(e) =>
                              setUiConfig((prev) => ({
                                ...prev,
                                ssh_keepalive_interval_sec: Math.max(
                                  0,
                                  Number.parseInt(e.target.value || '30', 10),
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          id="strictHostKeyCheckingEdit"
                          checked={uiConfig.ssh_strict_host_key_checking}
                          onChange={(e) =>
                            setUiConfig((prev) => ({
                              ...prev,
                              ssh_strict_host_key_checking: e.target.checked,
                            }))
                          }
                          className="rounded bg-zinc-800 border-zinc-700"
                        />
                        <Label
                          htmlFor="strictHostKeyCheckingEdit"
                          className="text-zinc-300! m-0"
                        >
                          Strict host key checking
                        </Label>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-zinc-800/80 pt-4 space-y-1">
                    <Label>Notes (UI-only)</Label>
                    <textarea
                      value={uiConfig.notes}
                      onChange={(e) => setUiConfig((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Anything about this server you want to remember…"
                      className="w-full h-24 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 resize-y"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button size="sm" onClick={save} disabled={saving || !name || !address}>
                      {saving ? 'Saving…' : 'Save configuration'}
                    </Button>
                  </div>
                </Card>

                <Card className="p-4 text-xs text-zinc-500 space-y-1">
                  <div>
                    <span className="font-semibold text-zinc-300">ID: </span>
                    <span className="break-all">{server.id}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-300">Status: </span>
                    <span>{server.is_active ? 'Active' : 'Disabled'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-300">Created: </span>
                    <span>{formatDateTime(server.created_at)}</span>
                  </div>
                </Card>
              </section>
            )}

            {tab === 'deployments' && (
              <section className="space-y-4">
                <Card className="p-4 space-y-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Deployment settings</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      These are UI-only for now (saved in your browser per server).
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 text-xs">
                    <div className="space-y-1">
                      <Label>Max concurrent builds / deploys</Label>
                      <Input
                        type="number"
                        min={1}
                        max={32}
                        value={uiConfig.max_concurrent_deploys}
                        onChange={(e) =>
                          setUiConfig((prev) => ({
                            ...prev,
                            max_concurrent_deploys: Math.max(
                              1,
                              Number.parseInt(e.target.value || '1', 10),
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Docker context</Label>
                      <Input
                        value={uiConfig.docker_context}
                        onChange={(e) =>
                          setUiConfig((prev) => ({ ...prev, docker_context: e.target.value }))
                        }
                        placeholder="default"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <Label>Deploy root directory</Label>
                    <Input
                      value={uiConfig.deploy_root_dir}
                      onChange={(e) =>
                        setUiConfig((prev) => ({ ...prev, deploy_root_dir: e.target.value }))
                      }
                      placeholder="/opt/lightpup"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setUiConfig((prev) => ({
                          ...prev,
                          max_concurrent_deploys: DEFAULT_UI.max_concurrent_deploys,
                          deploy_root_dir: DEFAULT_UI.deploy_root_dir,
                          docker_context: DEFAULT_UI.docker_context,
                        }))
                      }
                    >
                      Reset deployment settings
                    </Button>
                  </div>
                </Card>
              </section>
            )}

            {tab === 'proxy' && (
              <section className="space-y-4">
                <Card className="p-4 space-y-3 text-xs text-zinc-400">
                  <h2 className="text-sm font-semibold text-zinc-100">Proxy configuration</h2>
                  <p>
                    LightPup&apos;s built-in proxy automatically routes traffic to running applications on this server.
                    You control how this server is reached by configuring its address.
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      <span className="font-semibold text-zinc-300">Remote SSH server</span>: use an address like{' '}
                      <code className="rounded bg-zinc-900 px-1 py-0.5 text-[10px]">ssh user@host</code> or{' '}
                      <code className="rounded bg-zinc-900 px-1 py-0.5 text-[10px]">user@host</code>.
                    </li>
                    <li>
                      <span className="font-semibold text-zinc-300">Local Docker host</span>: use{' '}
                      <code className="rounded bg-zinc-900 px-1 py-0.5 text-[10px]">localhost</code> or another local hostname.
                    </li>
                  </ul>
                  <p>
                    When deployments target this server, LightPup will either run Docker locally or over SSH based on this value.
                    Update the address in the Configuration tab to change the SSH or proxy target.
                  </p>
                </Card>
              </section>
            )}

            {tab === 'terminal' && (
              <section className="space-y-4">
                <Card className="p-0 overflow-hidden border-zinc-800">
                  <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2.5">
                    <span className="text-xs font-semibold text-zinc-200">
                      Server terminal
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        serverId && server &&
                        openTerminalOverlay(serverId, server.name)
                      }
                    >
                      Open at bottom
                    </Button>
                  </div>
                  <div className="bg-zinc-900 p-3">
                    <div
                      ref={terminalContainerRef}
                      className="terminal-container h-[420px] w-full rounded-md"
                    />
                  </div>
                  {!terminalReady && (
                    <div className="border-t border-zinc-800 bg-zinc-900/80 px-4 py-2 text-[11px] text-zinc-500">
                      Connecting to terminal…
                    </div>
                  )}
                </Card>
              </section>
            )}

            {tab === 'danger' && (
              <section className="space-y-4">
                <Card className="p-4 space-y-4 border-rose-900/60">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Danger zone</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      Actions here are destructive and can’t be undone.
                    </p>
                  </div>

                  <div className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-4 space-y-2">
                    <div className="text-xs text-zinc-300">
                      <span className="font-semibold">Remove server</span>
                      <span className="text-zinc-500">
                        {' '}
                        — deployments will no longer target it.
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] text-zinc-500 break-all">
                        Server ID: {server?.id}
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setConfirmDeleteOpen(true)}
                        disabled={deleting}
                      >
                        {deleting ? 'Removing…' : 'Remove server'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </section>
            )}
          </>
        )}
      </PageMain>
    </div>
  )
}

