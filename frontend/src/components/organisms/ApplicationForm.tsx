import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Application, Server } from '../../lib/api'
import { api } from '../../lib/api'
import { AppPresetSelector } from '../molecules/AppPresetSelector'
import type { AppPreset } from '../../lib/appPresets'

type DeployMethod = 'quick' | 'github' | 'custom'

type GithubRepo = {
  id: number
  name: string
  full_name: string
  html_url: string
  private: boolean
  default_branch: string
}

type GithubSettings = {
  token: string | null
  webhook_secret: string | null
  server_url: string | null
}

export function ApplicationForm({
  initial,
  onSubmit,
  disabled: formDisabled,
}: {
  initial?: Partial<Application>
  onSubmit: (payload: {
    name: string
    domain?: string | null
    image: string
    port: number
    repo_url?: string | null
    repo_branch?: string | null
    dockerfile_path?: string | null
    build_type?: 'static' | 'docker' | 'docker_compose' | 'railpack'
    server_id?: string | null
    dockerfile_content?: string | null
    docker_compose_content?: string | null
    health_path?: string | null
    health_timeout_secs?: number | null
  }) => Promise<void>
  /** When true, submit button is disabled (e.g. viewer role). */
  disabled?: boolean
}) {
  const [deployMethod, setDeployMethod] = useState<DeployMethod>(
    initial?.repo_url ? 'github' : initial?.dockerfile_content || initial?.docker_compose_content ? 'custom' : 'quick'
  )
  const [selectedPreset, setSelectedPreset] = useState<AppPreset | null>(null)
  const [buildType, setBuildType] = useState<'docker' | 'docker_compose'>('docker')
  const [name, setName] = useState(initial?.name ?? '')
  const [customImage, setCustomImage] = useState('')
  const [domain, setDomain] = useState(initial?.domain ?? '')
  const [image, setImage] = useState(initial?.image ?? '')
  const [port, setPort] = useState(initial?.port ?? 80)
  const [repoUrl, setRepoUrl] = useState(initial?.repo_url ?? '')
  const [repoBranch, setRepoBranch] = useState(initial?.repo_branch ?? 'main')
  const [dockerfileContent, setDockerfileContent] = useState(initial?.dockerfile_content ?? '')
  const [dockerComposeContent, setDockerComposeContent] = useState(initial?.docker_compose_content ?? '')
  const [serverId, setServerId] = useState<string>(initial?.server_id ?? '')
  const [healthPath, setHealthPath] = useState(initial?.health_path ?? '')
  const [healthTimeoutSecs, setHealthTimeoutSecs] = useState(initial?.health_timeout_secs ?? 5)
  const [servers, setServers] = useState<Server[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // GitHub integration state
  const [githubSettings, setGithubSettings] = useState<GithubSettings | null>(null)
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([])
  const [githubLoading, setGithubLoading] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [creatingWebhook, setCreatingWebhook] = useState(false)

  useEffect(() => {
    api<Server[]>('/api/servers').then(setServers).catch(() => setServers([]))
    checkGithubSettings()
  }, [])

  async function checkGithubSettings() {
    try {
      const settings = await api<GithubSettings>('/api/settings/github')
      setGithubSettings(settings)
      if (settings.token) {
        const repos = await api<{ login: string; repos: GithubRepo[] }>('/api/github/repos')
        setGithubRepos(repos.repos || [])
      }
    } catch (e) {
      console.error('Failed to fetch GitHub settings:', e)
    }
  }

  async function handleSelectRepo(repo: GithubRepo) {
    setRepoUrl(repo.full_name)
    setRepoBranch(repo.default_branch)
    setRepoSearch('')
    
    // Auto-create webhook
    if (githubSettings?.server_url) {
      setCreatingWebhook(true)
      try {
        const [owner, repoName] = repo.full_name.split('/')
        await api(`/api/github/repos/${owner}/${repoName}/webhook`, { method: 'POST' })
      } catch (e) {
        console.error('Failed to create webhook:', e)
      } finally {
        setCreatingWebhook(false)
      }
    }
  }

  useEffect(() => {
    if (!initial) {
      setImage('')
      setPort(80)
      setSelectedPreset(null)
    }
  }, [initial])

  function applyPreset(preset: AppPreset) {
    setSelectedPreset(preset)
    setImage(preset.image)
    setPort(preset.defaultPort)
    if (!name) {
      setName(preset.name.toLowerCase())
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!name) {
      setError('Application name is required')
      return
    }

    if (deployMethod === 'quick' && !image) {
      setError('Please select an application from the library')
      return
    }

    if (deployMethod === 'github' && !repoUrl) {
      setError('Please select a repository')
      return
    }

    if (deployMethod === 'custom') {
      if (buildType === 'docker' && !dockerfileContent) {
        setError('Dockerfile content is required')
        return
      }
      if (buildType === 'docker_compose' && !dockerComposeContent) {
        setError('Docker Compose content is required')
        return
      }
    }

    setSaving(true)
    try {
      const buildTypeValue = deployMethod === 'quick' 
        ? 'static' 
        : deployMethod === 'github' 
          ? 'railpack' 
          : buildType

      await onSubmit({
        name,
        domain: domain || null,
        image: deployMethod === 'quick' ? image : deployMethod === 'github' ? 'git-built' : (buildType === 'docker_compose' ? 'docker-compose' : customImage || 'custom-dockerfile'),
        port: deployMethod === 'custom' && buildType === 'docker_compose' ? 80 : port,
        repo_url: deployMethod === 'github' ? repoUrl : null,
        repo_branch: deployMethod === 'github' ? repoBranch : null,
        dockerfile_path: null,
        build_type: buildTypeValue,
        server_id: serverId || null,
        dockerfile_content: deployMethod === 'custom' && buildType === 'docker' ? dockerfileContent : null,
        docker_compose_content: deployMethod === 'custom' && buildType === 'docker_compose' ? dockerComposeContent : null,
        health_path: healthPath.trim() || null,
        health_timeout_secs: healthTimeoutSecs > 0 ? healthTimeoutSecs : null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create application')
    } finally {
      setSaving(false)
    }
  }

  const isGithubConnected = !!(githubSettings?.token)
  const filteredRepos = githubRepos.filter(repo =>
    repo.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Deployment Method Selection */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          How do you want to deploy?
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setDeployMethod('quick')}
            className={`p-4 rounded-lg border text-left transition-all ${
              deployMethod === 'quick'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${deployMethod === 'quick' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
                <svg className={`w-5 h-5 ${deployMethod === 'quick' ? 'text-emerald-400' : 'text-zinc-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-zinc-100">Quick Deploy</div>
                <div className="text-xs text-zinc-500 mt-0.5">Pick from app library</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setDeployMethod('github')}
            className={`p-4 rounded-lg border text-left transition-all ${
              deployMethod === 'github'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${deployMethod === 'github' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
                <svg className={`w-5 h-5 ${deployMethod === 'github' ? 'text-emerald-400' : 'text-zinc-400'}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.088 3.292 9.395 7.868 10.917.576.108.787-.248.787-.556 0-.275-.01-1.003-.015-1.97-3.2.695-3.875-1.542-3.875-1.542-.524-1.33-1.28-1.685-1.28-1.685-1.046-.715.08-.7.08-.7 1.158.081 1.767 1.19 1.767 1.19 1.028 1.763 2.697 1.254 3.354.959.104-.745.402-1.255.73-1.542-2.555-.291-5.238-1.278-5.238-5.686 0-1.256.45-2.283 1.188-3.087-.12-.292-.516-1.468.112-3.06 0 0 .968-.31 3.172 1.178A11.02 11.02 0 0 1 12 5.31c.98.004 1.968.133 2.89.39 2.202-1.488 3.168-1.178 3.168-1.178.63 1.592.234 2.768.115 3.06.74.804 1.186 1.831 1.186 3.087 0 4.42-2.688 5.392-5.252 5.678.414.357.784 1.062.784 2.14 0 1.545-.014 2.79-.014 3.17 0 .31.208.67.794.556C20.21 21.39 23.5 17.084 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-zinc-100">GitHub Repo</div>
                <div className="text-xs text-zinc-500 mt-0.5">Build from repository</div>
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setDeployMethod('custom')}
            className={`p-4 rounded-lg border text-left transition-all ${
              deployMethod === 'custom'
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${deployMethod === 'custom' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
                <svg className={`w-5 h-5 ${deployMethod === 'custom' ? 'text-emerald-400' : 'text-zinc-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-zinc-100">Custom Build</div>
                <div className="text-xs text-zinc-500 mt-0.5">Dockerfile or Compose</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Quick Deploy - App Library */}
      {deployMethod === 'quick' && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Select Application
          </p>
          <AppPresetSelector
            selectedPreset={selectedPreset}
            onSelect={applyPreset}
          />
          {image && (
            <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="text-sm text-zinc-300">
                Selected: <span className="font-medium text-zinc-100">{image}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GitHub Repo */}
      {deployMethod === 'github' && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Repository
          </p>
          {!isGithubConnected ? (
            <div className="p-6 rounded-lg border border-zinc-700 bg-zinc-900 text-center">
              <svg className="w-12 h-12 mx-auto text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.088 3.292 9.395 7.868 10.917.576.108.787-.248.787-.556 0-.275-.01-1.003-.015-1.97-3.2.695-3.875-1.542-3.875-1.542-.524-1.33-1.28-1.685-1.28-1.685-1.046-.715.08-.7.08-.7 1.158.081 1.767 1.19 1.767 1.19 1.028 1.763 2.697 1.254 3.354.959.104-.745.402-1.255.73-1.542-2.555-.291-5.238-1.278-5.238-5.686 0-1.256.45-2.283 1.188-3.087-.12-.292-.516-1.468.112-3.06 0 0 .968-.31 3.172 1.178A11.02 11.02 0 0 1 12 5.31c.98.004 1.968.133 2.89.39 2.202-1.488 3.168-1.178 3.168-1.178.63 1.592.234 2.768.115 3.06.74.804 1.186 1.831 1.186 3.087 0 4.42-2.688 5.392-5.252 5.678.414.357.784 1.062.784 2.14 0 1.545-.014 2.79-.014 3.17 0 .31.208.67.794.556C20.21 21.39 23.5 17.084 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
              </svg>
              <p className="mt-3 text-zinc-300">Connect GitHub in Settings to deploy from repositories</p>
              <Link
                to="/settings/integrations"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-500 text-zinc-950 text-sm font-medium hover:bg-emerald-400"
              >
                Go to Settings
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                placeholder="Search repositories..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />

              {repoSearch && (
                <div className="max-h-48 overflow-y-auto border border-zinc-700 rounded-md bg-zinc-900">
                  {filteredRepos.length === 0 ? (
                    <div className="p-3 text-sm text-zinc-500 text-center">No repositories found</div>
                  ) : (
                    filteredRepos.map(repo => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => handleSelectRepo(repo)}
                        className="w-full p-3 text-left hover:bg-zinc-800 border-b border-zinc-800 last:border-0"
                      >
                        <div className="font-medium text-zinc-100">{repo.full_name}</div>
                        <div className="text-xs text-zinc-500">
                          {repo.private ? 'Private' : 'Public'} - {repo.default_branch}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {repoUrl && (
                <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-zinc-100">{repoUrl}</div>
                      <div className="text-xs text-zinc-500">Branch: {repoBranch}</div>
                      {creatingWebhook && (
                        <div className="text-xs text-emerald-400 mt-1">Setting up auto-deploy webhook...</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRepoUrl('')
                        setRepoBranch('main')
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Custom Build */}
      {deployMethod === 'custom' && (
        <div className="space-y-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Build Type
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setBuildType('docker')}
              className={`p-3 rounded-lg border text-center transition-all ${
                buildType === 'docker'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
              }`}
            >
              <div className="font-medium text-zinc-100">Dockerfile</div>
            </button>
            <button
              type="button"
              onClick={() => setBuildType('docker_compose')}
              className={`p-3 rounded-lg border text-center transition-all ${
                buildType === 'docker_compose'
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
              }`}
            >
              <div className="font-medium text-zinc-100">Docker Compose</div>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Custom Image Name (optional)
            </label>
            <input
              value={customImage}
              onChange={(e) => setCustomImage(e.target.value)}
              placeholder="my-custom-app:latest"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Give your custom build a name to identify it in Docker
            </p>
          </div>

          {buildType === 'docker' && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Dockerfile Content
              </label>
              <textarea
                value={dockerfileContent}
                onChange={(e) => setDockerfileContent(e.target.value)}
                placeholder={`FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]`}
                className="w-full h-48 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-mono outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />
            </div>
          )}

          {buildType === 'docker_compose' && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Docker Compose Content
              </label>
              <textarea
                value={dockerComposeContent}
                onChange={(e) => setDockerComposeContent(e.target.value)}
                placeholder={`version: '3'
services:
  web:
    build: .
    ports:
      - '80:80'
  db:
    image: postgres:15`}
                className="w-full h-48 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-mono outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />
            </div>
          )}
        </div>
      )}

      {/* Common Fields */}
      {(deployMethod === 'quick' || deployMethod === 'github' || deployMethod === 'custom') && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Application Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-app"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />
            </div>
            {!(deployMethod === 'custom' && buildType === 'docker_compose') && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Port
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 80)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Domain (optional)
            </label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Requests for this host will be proxied to this application.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Deploy to Server
            </label>
            <select
              value={serverId}
              onChange={(e) => setServerId(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="">Default (first active server or local Docker)</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.address ? `(${s.address})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Health check path (optional)
              </label>
              <input
                value={healthPath}
                onChange={(e) => setHealthPath(e.target.value)}
                placeholder="health"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Used for blue-green deploy; default is &quot;health&quot;.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Health check timeout (seconds)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={healthTimeoutSecs}
                onChange={(e) => setHealthTimeoutSecs(Math.max(1, parseInt(e.target.value) || 5))}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving || formDisabled}
              className="inline-flex items-center rounded-md bg-emerald-500 px-6 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating...' : initial?.id ? 'Save' : 'Create Application'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}
