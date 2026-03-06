import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Input } from '../components/atoms/Input'
import { Label } from '../components/atoms/Label'
import { useAuth } from '../contexts/AuthContext'
import { acceptInvite, getInvite } from '../lib/api'
import Logo from '../assets/logo.png'

export function InvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const navigate = useNavigate()
  const { user } = useAuth()
  const [invite, setInvite] = useState<{ username: string; role: string; valid: boolean } | null>(null)
  const [loading, setLoading] = useState(!!token)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true })
      return
    }
    if (!token) {
      setLoading(false)
      return
    }
    getInvite(token)
      .then((data) => setInvite(data))
      .catch(() => setInvite({ username: '', role: '', valid: false }))
      .finally(() => setLoading(false))
  }, [token, user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await acceptInvite(token, password)
      setAccepted(true)
      setTimeout(() => navigate('/login', { replace: true }), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite')
    } finally {
      setSubmitting(false)
    }
  }

  if (user) return null

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading invite…</p>
      </div>
    )
  }

  if (!token || !invite?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/80 p-6 text-center">
          <img src={Logo} alt="LightPup" className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-lg font-semibold text-zinc-100">Invalid or expired invite</h1>
          <p className="mt-2 text-sm text-zinc-500">
            This invite link is invalid or has expired. Ask an admin for a new invite.
          </p>
          <Button className="mt-6" onClick={() => navigate('/login')}>
            Go to login
          </Button>
        </div>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/80 p-6 text-center">
          <img src={Logo} alt="LightPup" className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-lg font-semibold text-emerald-400">Account created</h1>
          <p className="mt-2 text-sm text-zinc-500">Redirecting to login…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl">
        <div className="mb-6 text-center">
          <img src={Logo} alt="LightPup" className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-100">
            Accept invite
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Set a password for <span className="font-medium text-zinc-300">{invite.username}</span>
            {invite.role && (
              <span className="text-zinc-500"> (role: {invite.role})</span>
            )}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="invite-password">Password</Label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mt-1 w-full"
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <div>
            <Label htmlFor="invite-confirm">Confirm password</Label>
            <Input
              id="invite-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="mt-1 w-full"
              autoComplete="new-password"
            />
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-500">
          <button
            type="button"
            className="hover:text-zinc-400 underline"
            onClick={() => navigate('/login')}
          >
            Back to login
          </button>
        </p>
      </div>
    </div>
  )
}
