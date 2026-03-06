import { useEffect, useState } from 'react'
import type { Server } from '../lib/api'
import { api } from '../lib/api'
import { useTerminalOverlay } from '../contexts/TerminalOverlayContext'

export function TerminalBar() {
  const { isOpen, openTerminal } = useTerminalOverlay()
  const [servers, setServers] = useState<Server[]>([])
  const [selectedId, setSelectedId] = useState<string>('')

  useEffect(() => {
    api<Server[]>('/api/servers')
      .then((list) => {
        setServers(list)
        if (list.length > 0 && !selectedId) {
          const active = list.find((s) => s.is_active) ?? list[0]
          setSelectedId(active.id)
        }
      })
      .catch(() => setServers([]))
  }, [])

  if (isOpen) return null

  const selectedServer = servers.find((s) => s.id === selectedId)
  const canOpen = selectedServer && servers.length > 0

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center gap-3 border-t border-zinc-800 bg-zinc-900/95 px-4 py-2 backdrop-blur-sm"
      role="region"
      aria-label="Open terminal"
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Terminal
      </span>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="min-w-0 max-w-[200px] rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-emerald-500 md:max-w-[240px]"
        aria-label="Select server"
      >
        {servers.length === 0 ? (
          <option value="">No servers</option>
        ) : (
          servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.address ? `(${s.address})` : ''}
            </option>
          ))
        )}
      </select>
      <button
        type="button"
        onClick={() =>
          canOpen && openTerminal(selectedServer!.id, selectedServer!.name)
        }
        disabled={!canOpen}
        className="rounded border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        Open terminal
      </button>
    </div>
  )
}
