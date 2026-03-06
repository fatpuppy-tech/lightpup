import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../components/atoms/Card'
import { Button } from '../../components/atoms/Button'
import { api } from '../../lib/api'

type GithubSettings = {
  token: string | null
  webhook_secret: string | null
  server_url: string | null
}

type WebhookUrl = {
  url: string
  secret: string
}

function authBase(): string {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:3000'
  }
  return ''
}

export function SettingsIntegrationsTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [settings, setSettings] = useState<GithubSettings>({ token: null, webhook_secret: null, server_url: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState<WebhookUrl | null>(null)
  const [showToken, setShowToken] = useState(false)

  const githubParam = searchParams.get('github')
  const githubMessage = searchParams.get('message') ?? ''

  useEffect(() => {
    fetchSettings()
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

  async function fetchSettings() {
    try {
      const data = await api<GithubSettings>('/api/settings/github')
      setSettings(data)
      if (data.server_url) {
        const url = await api<WebhookUrl>('/api/github/webhook-url')
        setWebhookUrl(url)
      }
    } catch (e) {
      console.error('Failed to fetch GitHub settings:', e)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      await api('/api/settings/github', {
        method: 'PUT',
        body: JSON.stringify({
          token: settings.token || null,
          server_url: settings.server_url || null,
        }),
      })
      await fetchSettings()
    } catch (e) {
      console.error('Failed to save GitHub settings:', e)
    } finally {
      setSaving(false)
    }
  }

  async function disconnectGithub() {
    setSaving(true)
    try {
      await api('/api/settings/github', {
        method: 'PUT',
        body: JSON.stringify({ token: null }),
      })
      await fetchSettings()
    } catch (e) {
      console.error('Failed to disconnect GitHub:', e)
    } finally {
      setSaving(false)
    }
  }

  const isConnected = !!(settings?.token)
  const githubError = githubParam === 'error'
  const githubSuccess = githubParam === 'connected'
  const authStartUrl = `${authBase()}/auth/github/start`

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">GitHub Integration</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Connect GitHub to deploy from repositories and enable automatic deployments on push.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-xs text-zinc-500">Checking...</span>
            ) : isConnected ? (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">Connected</span>
            ) : (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">Not connected</span>
            )}
          </div>
        </div>

        {githubSuccess && (
          <p className="mt-2 text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded">
            GitHub connected successfully.
          </p>
        )}
        {githubError && (
          <p className="mt-2 text-xs text-amber-400 bg-amber-500/10 p-2 rounded">
            {githubMessage === 'config'
              ? 'GitHub OAuth is not configured (set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET).'
              : `Error: ${githubMessage || 'unknown'}`}
          </p>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              GitHub Personal Access Token
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={settings?.token || ''}
                onChange={(e) => setSettings(s => ({ ...s, token: e.target.value }))}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 pr-10 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showToken ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Generate a token at{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:underline"
              >
                github.com/settings/tokens
              </a>
              . Select <code className="bg-zinc-800 px-1 rounded">repo</code> scope.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Server URL
            </label>
            <input
              type="text"
              value={settings?.server_url || ''}
              onChange={(e) => setSettings(s => s ? { ...s, server_url: e.target.value } : null)}
              placeholder="https://your-server.com"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Public URL of your LightPup server (used for webhook URLs).
            </p>
          </div>

          {webhookUrl && (
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="text-xs font-medium text-zinc-400 mb-2">Webhook Configuration</div>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-zinc-500">Webhook URL:</span>
                  <code className="ml-2 text-xs text-emerald-400">{webhookUrl.url}</code>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Secret:</span>
                  <code className="ml-2 text-xs text-zinc-400">{webhookUrl.secret}</code>
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                This URL will be automatically configured when you select a GitHub repository.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
          {isConnected && (
            <Button variant="secondary" onClick={disconnectGithub} disabled={saving}>
              Disconnect
            </Button>
          )}
        </div>
      </Card>

      {!isConnected && (
        <Card>
          <h3 className="text-sm font-semibold text-zinc-100 mb-2">Alternative: OAuth</h3>
          <p className="text-xs text-zinc-500 mb-3">
            Instead of using a Personal Access Token, you can set up GitHub OAuth for a "Login with GitHub" experience.
            This requires configuring OAuth credentials in environment variables.
          </p>
          <a
            href={authStartUrl}
            className="inline-flex items-center gap-2 rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.088 3.292 9.395 7.868 10.917.576.108.787-.248.787-.556 0-.275-.01-1.003-.015-1.97-3.2.695-3.875-1.542-3.875-1.542-.524-1.33-1.28-1.685-1.28-1.685-1.046-.715.08-.7.08-.7 1.158.081 1.767 1.19 1.767 1.19 1.028 1.763 2.697 1.254 3.354.959.104-.745.402-1.255.73-1.542-2.555-.291-5.238-1.278-5.238-5.686 0-1.256.45-2.283 1.188-3.087-.12-.292-.516-1.468.112-3.06 0 0 .968-.31 3.172 1.178A11.02 11.02 0 0 1 12 5.31c.98.004 1.968.133 2.89.39 2.202-1.488 3.168-1.178 3.168-1.178.63 1.592.234 2.768.115 3.06.74.804 1.186 1.831 1.186 3.087 0 4.42-2.688 5.392-5.252 5.678.414.357.784 1.062.784 2.14 0 1.545-.014 2.79-.014 3.17 0 .31.208.67.794.556C20.21 21.39 23.5 17.084 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
            </svg>
            Connect via OAuth
          </a>
        </Card>
      )}
    </div>
  )
}
