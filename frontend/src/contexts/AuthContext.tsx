import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { AuthUser } from '../lib/api'
import {
  auth2faVerify,
  authLogin,
  authLogout,
  authMe,
  authSetup,
  authSetupRequired,
  setApi401Handler,
} from '../lib/api'

type AuthState = {
  user: AuthUser | null
  loading: boolean
  setupRequired: boolean
}

type AuthContextValue = AuthState & {
  login: (username: string, password: string) => Promise<{ needs2fa?: boolean }>
  complete2fa: (code: string) => Promise<void>
  logout: () => Promise<void>
  createFirstUser: (username: string, password: string) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const me = await authMe()
      setUser(me)
      setSetupRequired(false)
    } catch {
      setUser(null)
      try {
        const { required } = await authSetupRequired()
        setSetupRequired(required)
      } catch {
        setSetupRequired(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    setApi401Handler(() => setUser(null))
    return () => setApi401Handler(null)
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await authLogin(username, password)
      if (res.needs_2fa) return { needs2fa: true }
      if (res.username) {
        setUser({ username: res.username, id: '' })
        await refresh()
      }
      return {}
    },
    [refresh]
  )

  const complete2fa = useCallback(
    async (code: string) => {
      const res = await auth2faVerify(code)
      if (res.username) {
        setUser({ username: res.username, id: res.id ?? '' })
        await refresh()
      }
    },
    [refresh]
  )

  const logout = useCallback(async () => {
    await authLogout()
    setUser(null)
  }, [])

  const createFirstUser = useCallback(
    async (username: string, password: string) => {
      await authSetup(username, password)
      await refresh()
    },
    [refresh]
  )

  const value: AuthContextValue = {
    user,
    loading,
    setupRequired: setupRequired ?? false,
    login,
    complete2fa,
    logout,
    createFirstUser,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
