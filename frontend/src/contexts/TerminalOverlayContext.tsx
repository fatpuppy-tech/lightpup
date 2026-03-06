import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type TerminalOverlayState = {
  serverId: string | null
  serverName: string | null
}

type TerminalOverlayContextValue = TerminalOverlayState & {
  isOpen: boolean
  openTerminal: (serverId: string, serverName: string) => void
  closeTerminal: () => void
}

const TerminalOverlayContext = createContext<TerminalOverlayContextValue | null>(
  null,
)

export function TerminalOverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TerminalOverlayState>({
    serverId: null,
    serverName: null,
  })

  const openTerminal = useCallback((serverId: string, serverName: string) => {
    setState({ serverId, serverName })
  }, [])

  const closeTerminal = useCallback(() => {
    setState({ serverId: null, serverName: null })
  }, [])

  const value: TerminalOverlayContextValue = {
    ...state,
    isOpen: state.serverId !== null,
    openTerminal,
    closeTerminal,
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
