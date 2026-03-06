import { useEffect, useState } from 'react'
import type { Application, Server } from '../../lib/api'
import { api } from '../../lib/api'
import { AppPresetSelector } from '../molecules/AppPresetSelector'
import { BuildSourceSelector } from '../molecules/BuildSourceSelector'
import type { AppPreset } from '../../lib/appPresets'

export function ApplicationForm({
  initial,
  onSubmit,
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
  }) => Promise<void>
}) {
  const [template, setTemplate] = useState('custom')
  const [selectedPreset, setSelectedPreset] = useState<AppPreset | null>(null)
  const [source, setSource] = useState<'docker' | 'git'>(
    initial?.repo_url ? 'git' : 'docker',
  )
  const [name, setName] = useState(initial?.name ?? '')
  const [domain, setDomain] = useState(initial?.domain ?? '')
  const [image, setImage] = useState(initial?.image ?? '')
  const [port, setPort] = useState(initial?.port ?? 80)
  const [repoUrl, setRepoUrl] = useState(initial?.repo_url ?? '')
  const [repoBranch, setRepoBranch] = useState(initial?.repo_branch ?? '')
  const [dockerfilePath, setDockerfilePath] = useState(
    initial?.dockerfile_path ?? '',
  )
  const [buildType, setBuildType] = useState<
    'static' | 'docker' | 'docker_compose' | 'railpack'
  >(initial?.build_type ?? 'static')
  const [serverId, setServerId] = useState<string>(initial?.server_id ?? '')
  const [servers, setServers] = useState<Server[]>([])
  const [saving, setSaving] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [repoUrlError, setRepoUrlError] = useState<string | null>(null)

  useEffect(() => {
    api<Server[]>('/api/servers').then(setServers).catch(() => setServers([]))
  }, [])

  useEffect(() => {
    if (!initial) {
      setImage('')
      setPort(80)
      setSelectedPreset(null)
    }
  }, [initial])
  useEffect(() => {
    if (initial?.server_id !== undefined) setServerId(initial.server_id ?? '')
  }, [initial?.server_id])

  function applyPreset(preset: AppPreset | null) {
    setSelectedPreset(preset)
    setTemplate(preset?.id ?? 'custom')
    if (preset) {
      setImage(preset.image)
      setPort(preset.defaultPort)
      if (!name) {
        setName(preset.name.toLowerCase())
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setImageError(null)
    setRepoUrlError(null)
    if (!name) return
    if (source === 'docker' && !image) {
      setImageError('Please provide a Docker image.')
      return
    }
    if (source === 'git' && !repoUrl) {
      setRepoUrlError('Please provide a Git repository URL.')
      return
    }
    setSaving(true)
    try {
      const finalImage = source === 'git' && !image ? 'git-built' : image
      await onSubmit({
        name,
        domain: domain || null,
        image: finalImage,
        port,
        repo_url: source === 'git' ? repoUrl : null,
        repo_branch: source === 'git' ? repoBranch || 'main' : null,
        dockerfile_path: source === 'git' ? dockerfilePath || 'Dockerfile' : null,
        build_type: buildType,
        server_id: serverId || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Select Application
        </p>
        <AppPresetSelector
          selectedPreset={selectedPreset}
          onSelect={applyPreset}
        />
      </section>

      <section className="space-y-4">
        <BuildSourceSelector
          value={source === 'git' ? 'github' : 'docker'}
          onChange={(val) => setSource(val === 'github' ? 'git' : 'docker')}
        />

        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400">
            Build pack
          </label>
          <select
            value={buildType}
            onChange={(e) =>
              setBuildType(
                e.target.value as
                  | 'static'
                  | 'docker'
                  | 'docker_compose'
                  | 'railpack',
              )
            }
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="static">Static (reverse proxy only)</option>
            <option value="docker">Dockerfile (single container)</option>
            <option value="docker_compose">Docker Compose (multi-container)</option>
            <option value="railpack">Railpack (auto-detect project)</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="web"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-zinc-400">
              Port
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 80)}
              className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400">
            Domain (subdomain)
          </label>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="app.localhost"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
          />
          <p className="text-[11px] text-zinc-500">
            Requests for this host will be proxied to this application&apos;s
            container port.
          </p>
        </div>

        {source === 'docker' && (
          <div className="space-y-1">
            <label htmlFor="app-form-image" className="block text-xs font-medium text-zinc-400">
              Docker image
            </label>
            <input
              id="app-form-image"
              value={image}
              onChange={(e) => {
                setImage(e.target.value)
                setImageError(null)
              }}
              placeholder="nginx:latest"
              className={`w-full rounded-md border px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500 ${
                imageError ? 'border-red-500 bg-zinc-900' : 'border-zinc-700 bg-zinc-900'
              }`}
              aria-invalid={!!imageError}
              aria-describedby={imageError ? 'app-form-image-error' : undefined}
            />
            {imageError && (
              <p id="app-form-image-error" className="text-xs text-red-400" role="alert">
                {imageError}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-medium text-zinc-400">
            Deploy to server
          </label>
          <select
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            className="w-full max-w-xs rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="">Default (first active remote or this machine)</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.address ? `(${s.address})` : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-zinc-500">
            Assign this app to a server so deploys run there via SSH. Leave default to use the first active server or local Docker.
          </p>
        </div>

        {source === 'git' && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="app-form-repo-url" className="block text-xs font-medium text-zinc-400">
                Git repository URL
              </label>
              <input
                id="app-form-repo-url"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value)
                  setRepoUrlError(null)
                }}
                placeholder="https://github.com/org/repo.git"
                className={`w-full rounded-md border px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500 ${
                  repoUrlError ? 'border-red-500 bg-zinc-900' : 'border-zinc-700 bg-zinc-900'
                }`}
                aria-invalid={!!repoUrlError}
                aria-describedby={repoUrlError ? 'app-form-repo-url-error' : undefined}
              />
              {repoUrlError && (
                <p id="app-form-repo-url-error" className="text-xs text-red-400" role="alert">
                  {repoUrlError}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400">
                Branch
              </label>
              <input
                value={repoBranch}
                onChange={(e) => setRepoBranch(e.target.value)}
                placeholder="main"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-zinc-400">
                Dockerfile path
              </label>
              <input
                value={dockerfilePath}
                onChange={(e) => setDockerfilePath(e.target.value)}
                placeholder="Dockerfile"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
              />
            </div>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <button
          className="inline-flex cursor-pointer items-center rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
          type="submit"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

