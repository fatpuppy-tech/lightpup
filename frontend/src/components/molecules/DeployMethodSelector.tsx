import { useState } from 'react'

const BoltIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

const GithubIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.088 3.292 9.395 7.868 10.917.576.108.787-.248.787-.556 0-.275-.01-1.003-.015-1.97-3.2.695-3.875-1.542-3.875-1.542-.524-1.33-1.28-1.685-1.28-1.685-1.046-.715.08-.7.08-.7 1.158.081 1.767 1.19 1.767 1.19 1.028 1.763 2.697 1.254 3.354.959.104-.745.402-1.255.73-1.542-2.555-.291-5.238-1.278-5.238-5.686 0-1.256.45-2.283 1.188-3.087-.12-.292-.516-1.468.112-3.06 0 0 .968-.31 3.172 1.178A11.02 11.02 0 0 1 12 5.31c.98.004 1.968.133 2.89.39 2.202-1.488 3.168-1.178 3.168-1.178.63 1.592.234 2.768.115 3.06.74.804 1.186 1.831 1.186 3.087 0 4.42-2.688 5.392-5.252 5.678.414.357.784 1.062.784 2.14 0 1.545-.014 2.79-.014 3.17 0 .31.208.67.794.556C20.21 21.39 23.5 17.084 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
  </svg>
)

const CodeIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
)

type DeployMethod = 'quick' | 'github' | 'custom'

type GithubRepo = {
  id: number
  name: string
  full_name: string
  html_url: string
  private: boolean
  default_branch: string
}

type GithubConnection = {
  connected: boolean
  username?: string
  repos?: GithubRepo[]
  loading?: boolean
}

type DeployMethodSelectorProps = {
  value: DeployMethod
  onChange: (value: DeployMethod) => void
}

export function DeployMethodSelector({ value, onChange }: DeployMethodSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <button
        type="button"
        onClick={() => onChange('quick')}
        className={`p-4 rounded-lg border text-left transition-all ${
          value === 'quick'
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${value === 'quick' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
            <BoltIcon className={`w-5 h-5 ${value === 'quick' ? 'text-emerald-400' : 'text-zinc-400'}`} />
          </div>
          <div>
            <div className="font-medium text-zinc-100">Quick Deploy</div>
            <div className="text-xs text-zinc-500 mt-0.5">Pick from app library</div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChange('github')}
        className={`p-4 rounded-lg border text-left transition-all ${
          value === 'github'
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${value === 'github' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
            <GithubIcon className={`w-5 h-5 ${value === 'github' ? 'text-emerald-400' : 'text-zinc-400'}`} />
          </div>
          <div>
            <div className="font-medium text-zinc-100">GitHub Repo</div>
            <div className="text-xs text-zinc-500 mt-0.5">Build from repository</div>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChange('custom')}
        className={`p-4 rounded-lg border text-left transition-all ${
          value === 'custom'
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${value === 'custom' ? 'bg-emerald-500/20' : 'bg-zinc-800'}`}>
            <CodeIcon className={`w-5 h-5 ${value === 'custom' ? 'text-emerald-400' : 'text-zinc-400'}`} />
          </div>
          <div>
            <div className="font-medium text-zinc-100">Custom Build</div>
            <div className="text-xs text-zinc-500 mt-0.5">Dockerfile or Compose</div>
          </div>
        </div>
      </button>
    </div>
  )
}

type GithubSelectorProps = {
  value: string
  onChange: (repo: string, branch: string) => void
  connection: GithubConnection
  onConnect: () => void
}

export function GithubSelector({ value, onChange, connection, onConnect }: GithubSelectorProps) {
  const [search, setSearch] = useState('')

  if (!connection.connected) {
    return (
      <div className="p-6 rounded-lg border border-zinc-700 bg-zinc-900 text-center">
        <GithubIcon className="w-12 h-12 mx-auto text-zinc-500" />
        <p className="mt-3 text-zinc-300">Connect to GitHub to deploy from your repositories</p>
        <button
          type="button"
          onClick={onConnect}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-100 text-zinc-900 text-sm font-medium hover:bg-zinc-200"
        >
          <GithubIcon className="w-4 h-4" />
          Connect GitHub
        </button>
      </div>
    )
  }

  const filteredRepos = connection.repos?.filter(repo =>
    repo.name.toLowerCase().includes(search.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  const selectedRepo = connection.repos?.find(r => r.full_name === value || r.name === value)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <GithubIcon className="w-4 h-4" />
        <span>Connected as {connection.username}</span>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Select Repository
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories..."
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
        />
      </div>

      {search && (
        <div className="max-h-48 overflow-y-auto border border-zinc-700 rounded-md bg-zinc-900">
          {filteredRepos.length === 0 ? (
            <div className="p-3 text-sm text-zinc-500 text-center">No repositories found</div>
          ) : (
            filteredRepos.map(repo => (
              <button
                key={repo.id}
                type="button"
                onClick={() => {
                  onChange(repo.full_name, repo.default_branch)
                  setSearch('')
                }}
                className="w-full p-3 text-left hover:bg-zinc-800 border-b border-zinc-800 last:border-0"
              >
                <div className="font-medium text-zinc-100">{repo.full_name}</div>
                <div className="text-xs text-zinc-500">
                  {repo.private ? 'Private' : 'Public'} • {repo.default_branch}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {selectedRepo && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-zinc-100">{selectedRepo.full_name}</div>
              <div className="text-xs text-zinc-500">
                {selectedRepo.private ? 'Private' : 'Public'} • Default branch: {selectedRepo.default_branch}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {selectedRepo && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Branch
          </label>
          <input
            type="text"
            placeholder={selectedRepo.default_branch}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500"
          />
        </div>
      )}
    </div>
  )
}

export type { GithubConnection, GithubRepo }
