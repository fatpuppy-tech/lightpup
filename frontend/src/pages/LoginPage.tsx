import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Input } from '../components/atoms/Input'
import { Label } from '../components/atoms/Label'
import { useAuth } from '../contexts/AuthContext'
import Logo from '../assets/logo.png'

export function LoginPage() {
  const { user, loading, setupRequired, login, complete2fa, createFirstUser, refresh } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needs2fa, setNeeds2fa] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    )
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createFirstUser(username.trim(), password)
      setPassword('')
      setError('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Setup failed'
      setError(msg)
      // If registration is no longer allowed (e.g. another user was created), refresh so we show login form
      if (
        msg.includes('Registration is not allowed') ||
        msg.includes('already exists') ||
        msg.includes('Setup already completed')
      ) {
        refresh()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await login(username.trim(), password)
      if (res.needs2fa) {
        setNeeds2fa(true)
        setCode('')
        setError('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handle2fa = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await complete2fa(code.replace(/\s/g, ''))
      setNeeds2fa(false)
      setCode('')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="w-full shrink-0 pb-2 flex flex-col justify-center items-center gap-2">
          <img src={Logo} alt="LightPup" className="h-12 w-12" /> 
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Light<span className="text-emerald-400">Pup</span>
          </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {setupRequired
              ? 'Create the first account'
              : needs2fa
                ? 'Enter your authenticator code'
                : 'Sign in to continue'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-800 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        {setupRequired ? (
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <Label htmlFor="setup-username">Username</Label>
              <Input
                id="setup-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={1}
                maxLength={64}
              />
            </div>
            <div>
              <Label htmlFor="setup-password">Password</Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="mt-1 text-[11px] text-zinc-500">At least 8 characters</p>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create account'}
            </Button>
          </form>
        ) : needs2fa ? (
          <form onSubmit={handle2fa} className="space-y-4">
            <div>
              <Label htmlFor="totp-code">Authentication code</Label>
              <Input
                id="totp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                required
                maxLength={8}
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={submitting || code.length < 6}>
              {submitting ? 'Verifying…' : 'Verify'}
            </Button>
            <button
              type="button"
              className="w-full cursor-pointer text-center text-xs text-zinc-500 hover:text-zinc-300"
              onClick={() => setNeeds2fa(false)}
            >
              Back to login
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
