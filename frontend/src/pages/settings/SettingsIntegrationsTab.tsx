import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/atoms/Card'
import { api } from '../../lib/api'

type GithubIntegration = { connected: boolean }

function authBase(): string {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:3000'
  }
  return ''
}

export function SettingsIntegrationsTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [github, setGithub] = useState<GithubIntegration | null>(null)
  const [githubLoading, setGithubLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const githubParam = searchParams.get('github')
  const githubMessage = searchParams.get('message') ?? ''

  useEffect(() => {
    api<GithubIntegration>('/api/integrations/github')
      .then(setGithub)
      .catch(() => setGithub({ connected: false }))
      .finally(() => setGithubLoading(false))
  }, [])

  useEffect(() => {
    if (githubParam) {
      const t = setTimeout(() => {
        setSearchParams((p) => {
          const next = new URLSearchParams(p)
          next.delete('github')
          next.delete('message')
          return next
        }, { replace: true })
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [githubParam, setSearchParams])

  async function disconnectGithub() {
    setDisconnecting(true)
    try {
      await api('/api/integrations/github', { method: 'DELETE' })
      setGithub({ connected: false })
    } finally {
      setDisconnecting(false)
    }
  }

  const githubConnected = github?.connected === true
  const githubError = githubParam === 'error'
  const githubSuccess = githubParam === 'connected'
  const authStartUrl = `${authBase()}/auth/github/start`

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          GitHub
        </h3>
        <p className="mt-2 text-xs text-zinc-500">
          Connect a GitHub account to clone private repositories when deploying. You can also set{' '}
          <span className="font-mono">GITHUB_TOKEN</span> in the environment instead.
        </p>
        {githubSuccess && (
          <p className="mt-2 text-xs text-emerald-400">GitHub connected successfully.</p>
        )}
        {githubError && (
          <p className="mt-2 text-xs text-amber-400">
            {githubMessage === 'config'
              ? 'GitHub OAuth is not configured (set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET).'
              : `Error: ${githubMessage || 'unknown'}`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {githubLoading ? (
            <span className="text-xs text-zinc-500">Checking…</span>
          ) : githubConnected ? (
            <>
              <span className="text-xs text-zinc-400">Connected</span>
              <button
                type="button"
                onClick={disconnectGithub}
                disabled={disconnecting}
                className="cursor-pointer rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <a
              href={authStartUrl}
              className="inline-flex items-center gap-1.5 rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              Connect GitHub
            </a>
          )}
        </div>
      </Card>
    </div>
  )
}
