import { Navigate, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getOnboardingStatus } from '../../lib/api'

export function ProtectedLayout() {
  const { user, loading } = useAuth()
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    if (user) {
      getOnboardingStatus()
        .then((status) => {
          setNeedsOnboarding(status.needs_onboarding)
        })
        .catch(() => {
          // If we can't check, assume no onboarding needed
        })
        .finally(() => {
          setCheckingOnboarding(false)
        })
    }
  }, [user])

  if (loading || checkingOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
