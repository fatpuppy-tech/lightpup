import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { useTerminalOverlay } from '../contexts/TerminalOverlayContext'
import { terminalTheme } from '../lib/terminalTheme'

const TERMINAL_HEIGHT = 320

export function TerminalOverlay() {
  const { serverId, serverName, closeTerminal, isOpen } = useTerminalOverlay()
  const containerRef = useRef<HTMLDivElement>(null)
  const [connecting, setConnecting] = useState(true)

  useEffect(() => {
    if (!isOpen || !serverId || !containerRef.current) return

    const container = containerRef.current
    const term = new Terminal({
      fontFamily:
        'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 13,
      theme: { ...terminalTheme },
      cursorBlink: true,
      scrollback: 2000,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()
    setConnecting(false)

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
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

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      setConnecting(true)
      window.removeEventListener('resize', handleResize)
      onData.dispose()
      term.dispose()
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      ) {
        socket.close()
      }
    }
  }, [isOpen, serverId])

  if (!isOpen || !serverId) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-zinc-800 bg-zinc-900 shadow-[0_-4px_24px_rgba(0,0,0,0.4)]"
      role="region"
      aria-label="Terminal overlay"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2">
        <span className="text-xs font-semibold text-zinc-200">
          Terminal — {serverName ?? serverId}
        </span>
        <button
          type="button"
          onClick={closeTerminal}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          aria-label="Close terminal"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div
        className="terminal-container relative overflow-hidden p-2"
        style={{ height: TERMINAL_HEIGHT }}
      >
        <div ref={containerRef} className="h-full w-full rounded-md" />
        {connecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/90">
            <span className="text-sm text-zinc-500">Connecting…</span>
          </div>
        )}
      </div>
    </div>
  )
}
