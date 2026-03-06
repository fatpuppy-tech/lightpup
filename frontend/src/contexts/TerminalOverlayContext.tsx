import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

export type TerminalOverlayOptions = {
  /** e.g. "Local shell" or "SSH: user@host" */
  connectionLabel?: string
  /** If true, terminal supports resize (local PTY). Frontend still sends resize for both. */
  isLocal?: boolean
}

const DEFAULT_TERMINAL_HEIGHT = 320
const MIN_TERMINAL_HEIGHT = 120
const MAX_TERMINAL_HEIGHT = 600

type TerminalOverlayState = {
  serverId: string | null
  serverName: string | null
  connectionLabel: string | null
  isLocal: boolean
  terminalHeight: number
}

type TerminalOverlayContextValue = TerminalOverlayState & {
  isOpen: boolean
  openTerminal: (serverId: string, serverName: string, options?: TerminalOverlayOptions) => void
  closeTerminal: () => void
  setTerminalHeight: (height: number) => void
  minTerminalHeight: number
  maxTerminalHeight: number
}

const TerminalOverlayContext = createContext<TerminalOverlayContextValue | null>(
  null,
)

export function TerminalOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TerminalOverlayState>({
    serverId: null,
    serverName: null,
    connectionLabel: null,
    isLocal: false,
    terminalHeight: DEFAULT_TERMINAL_HEIGHT,
  })

  const setTerminalHeight = useCallback((height: number) => {
    const n = Number(height)
    if (!Number.isFinite(n)) return
    setState((prev) => ({
      ...prev,
      terminalHeight: Math.min(MAX_TERMINAL_HEIGHT, Math.max(MIN_TERMINAL_HEIGHT, n)),
    }))
  }, [])

  const openTerminal = useCallback(
    (serverId: string, serverName: string, options?: TerminalOverlayOptions) => {
      setState((prev) => ({
        ...prev,
        serverId,
        serverName,
        connectionLabel: options?.connectionLabel ?? null,
        isLocal: options?.isLocal ?? false,
      }))
    },
    [],
  )

  const closeTerminal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      serverId: null,
      serverName: null,
      connectionLabel: null,
      isLocal: false,
    }))
  }, [])

  const value: TerminalOverlayContextValue = {
    ...state,
    isOpen: state.serverId !== null,
    openTerminal,
    closeTerminal,
    setTerminalHeight,
    minTerminalHeight: MIN_TERMINAL_HEIGHT,
    maxTerminalHeight: MAX_TERMINAL_HEIGHT,
  }

  return (
    <TerminalOverlayContext.Provider value={value}>
      {children}
    </TerminalOverlayContext.Provider>
  )
}

export function useTerminalOverlay() {
  const ctx = useContext(TerminalOverlayContext)
  if (!ctx) throw new Error('useTerminalOverlay must be used within TerminalOverlayProvider')
  return ctx
}
