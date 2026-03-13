import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Label } from '../components/atoms/Label'
import { Input } from '../components/atoms/Input'
import { Button } from '../components/atoms/Button'
import { api, type Project, type Server, type Application } from '../lib/api'
import { AppPresetSelector } from '../components/molecules/AppPresetSelector'
import { BuildSourceSelector } from '../components/molecules/BuildSourceSelector'
import type { AppPreset } from '../lib/appPresets'
import Logo from '../assets/logo.png'

type Step = 'server' | 'project' | 'application' | 'done'
type BuildSource = 'docker' | 'github'

const CheckCircleIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

const ArrowRightIcon = ({ className = '' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('server')
  const [saving, setSaving] = useState(false)

  const [serverName, setServerName] = useState('local-docker')
  const [serverAddress, setServerAddress] = useState('localhost')
  const [serverType, setServerType] = useState<'localhost' | 'remote'>('localhost')
  const [sshUser, setSshUser] = useState('')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [useKeyContent, setUseKeyContent] = useState(false)
  const [sshKeyContent, setSshKeyContent] = useState('')

  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [environmentName, setEnvironmentName] = useState('production')

  const [appName, setAppName] = useState('')
  const [appContainerName, setAppContainerName] = useState('')
  const [appImage, setAppImage] = useState('')
  const [appPort, setAppPort] = useState('80')
  const [appDomain, setAppDomain] = useState('')
  const [buildSource, setBuildSource] = useState<BuildSource>('docker')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoBranch, setRepoBranch] = useState('main')
  const [dockerfilePath, setDockerfilePath] = useState('Dockerfile')
  const [selectedPreset, setSelectedPreset] = useState<AppPreset | null>(null)

  const [createdServer, setCreatedServer] = useState<Server | null>(null)
  const [createdProject, setCreatedProject] = useState<Project | null>(null)
  const [createdEnvironmentId, setCreatedEnvironmentId] = useState<string | null>(null)
  const [createdApp, setCreatedApp] = useState<Application | null>(null)

  const isLocalhost = serverType === 'localhost'

  function applyPreset(preset: AppPreset) {
    setSelectedPreset(preset)
    setAppImage(preset.image)
    setAppPort(preset.defaultPort.toString())
    setAppName(appName || preset.name.toLowerCase())
    setAppContainerName(appContainerName || preset.name.toLowerCase())
  }

  async function saveServer() {
    if (!serverName || !serverAddress) return
    setSaving(true)
    try {
      const server = await api<Server>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({
          name: serverName,
          address: serverAddress,
          is_active: true,
          ssh_user: isLocalhost ? null : (sshUser || null),
          ssh_key_path: isLocalhost ? null : (useKeyContent ? null : (sshKeyPath || null)),
          ssh_key_content: isLocalhost ? null : (useKeyContent ? sshKeyContent : null),
        }),
      })
      setCreatedServer(server)
      setStep('project')
    } finally {
      setSaving(false)
    }
  }

  async function saveProject() {
    if (!projectName || !environmentName) return
    setSaving(true)
    try {
      const project = await api<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: projectName, description: projectDescription }),
      })
      setCreatedProject(project)

      const env = await api<{ id: string }>(`/api/projects/${project.id}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name: environmentName, is_production: true }),
      })
      setCreatedEnvironmentId(env.id)
      setStep('application')
    } finally {
      setSaving(false)
    }
  }

  async function saveApplication() {
    if (!appName || !createdEnvironmentId) return
    
    const imageToUse = buildSource === 'docker' ? appImage : appImage || `lightpup-${appName}`
    
    setSaving(true)
    try {
      const app = await api<Application>(`/api/environments/${createdEnvironmentId}/applications`, {
        method: 'POST',
        body: JSON.stringify({
          name: appName,
          image: imageToUse,
          port: parseInt(appPort) || 80,
          domain: appDomain || null,
          build_type: buildSource === 'github' ? 'docker' : 'docker',
          server_id: createdServer?.id,
          repo_url: buildSource === 'github' ? repoUrl : null,
          repo_branch: buildSource === 'github' ? repoBranch : null,
          dockerfile_path: buildSource === 'github' ? dockerfilePath : null,
        }),
      })
      setCreatedApp(app)
      setStep('done')
    } finally {
      setSaving(false)
    }
  }

  function skipOnboarding() {
    navigate('/')
  }

  function goToDashboard() {
    navigate('/')
  }

  const steps = [
    { key: 'server', label: 'Server' },
    { key: 'project', label: 'Project' },
    { key: 'application', label: 'Application' },
  ]

  const currentStepIndex = steps.findIndex((s) => s.key === step)

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Top Bar */}
      <div className="border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={Logo} alt="LightPup" className="h-8 w-8" />
            <span className="font-semibold text-zinc-100 text-lg">Light<span className="text-emerald-400">Pup</span></span>
          </div>
          <button onClick={skipOnboarding} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Skip setup
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <h1 className="text-2xl font-bold text-zinc-100 mb-2">Get Started</h1>
            <p className="text-sm text-zinc-500 mb-8">Set up your first deployment in just a few steps.</p>

            <nav className="space-y-2">
              {steps.map((s, i) => {
                const isActive = s.key === step
                const isComplete = currentStepIndex > i

                return (
                  <div key={s.key} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-zinc-900' : isComplete ? 'bg-zinc-900/50' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-blue-600 text-white' : isComplete ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                      {isComplete ? <CheckCircleIcon className="w-4 h-4" /> : <span className="text-sm font-medium">{i + 1}</span>}
                    </div>
                    <span className={`text-sm font-medium ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`}>{s.label}</span>
                  </div>
                )
              })}
            </nav>

            {step !== 'done' && (
              <div className="mt-8 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <p className="text-sm text-zinc-300">
                    {step === 'server' && 'Choose where your apps will run'}
                    {step === 'project' && 'Organize your apps into projects'}
                    {step === 'application' && 'Deploy your first container'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Step 1: Server */}
            {step === 'server' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">Where should we deploy?</h2>
                  <p className="text-sm text-zinc-500 mt-1">Select a server or use your local machine</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setServerType('localhost')
                      setServerName((prev) => prev || 'local-docker')
                      setServerAddress((prev) => prev || 'localhost')
                    }}
                    className={`p-4 rounded-lg border transition-all text-left ${isLocalhost ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}
                  >
                    <div className="font-medium text-zinc-100">Local Machine</div>
                    <div className="text-xs text-zinc-500 mt-1">localhost</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setServerType('remote')}
                    className={`p-4 rounded-lg border transition-all text-left ${!isLocalhost ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-800 hover:border-zinc-700'}`}
                  >
                    <div className="font-medium text-zinc-100">Remote Server</div>
                    <div className="text-xs text-zinc-500 mt-1">SSH connection</div>
                  </button>
                </div>

                <Card className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Server Name</Label>
                      <Input value={serverName} onChange={(e) => setServerName(e.target.value)} placeholder={isLocalhost ? 'local-docker' : 'production-1'} />
                    </div>
                    <div className="space-y-1">
                      <Label>Address</Label>
                      <Input value={serverAddress} onChange={(e) => setServerAddress(e.target.value)} placeholder={isLocalhost ? 'localhost' : '192.168.1.100'} />
                    </div>
                  </div>

                  {!isLocalhost && (
                    <>
                      <div className="space-y-1">
                        <Label>SSH Username</Label>
                        <Input value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="root, deploy, ubuntu" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="useKeyContentOnboard" checked={useKeyContent} onChange={(e) => setUseKeyContent(e.target.checked)} className="rounded bg-zinc-800 border-zinc-700" />
                          <Label htmlFor="useKeyContentOnboard" className="text-zinc-300! m-0 text-sm">Paste private key</Label>
                        </div>
                        {useKeyContent ? (
                          <textarea value={sshKeyContent} onChange={(e) => setSshKeyContent(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" className="w-full h-28 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 resize-y" />
                        ) : (
                          <Input value={sshKeyPath} onChange={(e) => setSshKeyPath(e.target.value)} placeholder="~/.ssh/id_ed25519" />
                        )}
                      </div>
                    </>
                  )}

                  {isLocalhost && (
                    <div className="p-3 bg-emerald-900/20 border border-emerald-800/50 rounded-lg">
                      <p className="text-xs text-emerald-400">Local Docker daemon will be used. No SSH configuration needed.</p>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button onClick={saveServer} disabled={saving || !serverName || !serverAddress}>
                      Continue <ArrowRightIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Step 2: Project */}
            {step === 'project' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">Create a Project</h2>
                  <p className="text-sm text-zinc-500 mt-1">Projects help you organize your applications</p>
                </div>

                <Card className="p-6 space-y-4">
                  <div className="space-y-1">
                    <Label>Project Name</Label>
                    <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="my-awesome-app" />
                  </div>
                  <div className="space-y-1">
                    <Label>Description (optional)</Label>
                    <Input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="What is this project about?" />
                  </div>
                  <div className="space-y-1">
                    <Label>Environment</Label>
                    <Input value={environmentName} onChange={(e) => setEnvironmentName(e.target.value)} placeholder="production" />
                    <p className="text-xs text-zinc-500">Production, staging, development - whatever fits your workflow</p>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="secondary" onClick={() => setStep('server')}>Back</Button>
                    <Button onClick={saveProject} disabled={saving || !projectName || !environmentName}>
                      Continue <ArrowRightIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Step 3: Application */}
            {step === 'application' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100">Deploy an Application</h2>
                  <p className="text-sm text-zinc-500 mt-1">Choose a preset or configure your own</p>
                </div>

                {/* Presets */}
                <div>
                  <Label className="mb-2 block">Popular Applications</Label>
                  <AppPresetSelector
                    selectedPreset={selectedPreset}
                    onSelect={applyPreset}
                  />
                </div>

                {/* Build Source */}
                <BuildSourceSelector
                  value={buildSource}
                  onChange={setBuildSource}
                />

                <Card className="p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Application Name</Label>
                      <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="my-app" />
                    </div>
                    {buildSource === 'docker' && (
                      <div className="space-y-1">
                        <Label>Container Name (optional)</Label>
                        <Input value={appContainerName} onChange={(e) => setAppContainerName(e.target.value)} placeholder="my-app-container" />
                      </div>
                    )}
                  </div>

                  {buildSource === 'docker' ? (
                    <div className="space-y-1">
                      <Label>Docker Image</Label>
                      <Input value={appImage} onChange={(e) => setAppImage(e.target.value)} placeholder="nginx:latest, redis:alpine" />
                      <p className="text-xs text-zinc-500">Docker Hub, GHCR, ECR, or any registry</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label>Repository URL</Label>
                        <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/repo" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Branch</Label>
                          <Input value={repoBranch} onChange={(e) => setRepoBranch(e.target.value)} placeholder="main" />
                        </div>
                        <div className="space-y-1">
                          <Label>Dockerfile Path</Label>
                          <Input value={dockerfilePath} onChange={(e) => setDockerfilePath(e.target.value)} placeholder="Dockerfile" />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Port</Label>
                      <Input value={appPort} onChange={(e) => setAppPort(e.target.value)} placeholder="80" />
                    </div>
                    <div className="space-y-1">
                      <Label>Domain (optional)</Label>
                      <Input value={appDomain} onChange={(e) => setAppDomain(e.target.value)} placeholder="app.example.com" />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <Button variant="secondary" onClick={() => setStep('project')}>Back</Button>
                    <Button onClick={saveApplication} disabled={saving || !appName || (buildSource === 'docker' && !appImage) || (buildSource === 'github' && !repoUrl)}>
                      {saving ? 'Creating...' : 'Deploy'} <ArrowRightIcon className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* Done */}
            {step === 'done' && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-green-600/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-100">All Done!</h2>
                  <p className="text-sm text-zinc-500 mt-1">Your deployment is ready to go</p>
                </div>

                <Card className="p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-zinc-800">
                      <span className="text-zinc-500">Server</span>
                      <span className="text-zinc-100">{createdServer?.name}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800">
                      <span className="text-zinc-500">Project</span>
                      <span className="text-zinc-100">{createdProject?.name}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-zinc-800">
                      <span className="text-zinc-500">Environment</span>
                      <span className="text-zinc-100">{environmentName}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-zinc-500">Application</span>
                      <span className="text-zinc-100">{createdApp?.name}</span>
                    </div>
                  </div>
                </Card>

                <div className="flex gap-4 justify-center">
                  <Button variant="secondary" onClick={goToDashboard}>Go to Dashboard</Button>
                  {createdApp && (
                    <Button onClick={async () => {
                      await api(`/api/applications/${createdApp.id}/deploy`, { method: 'POST', body: JSON.stringify({ version: 'latest' }) })
                      navigate(`/applications/${createdApp.id}`)
                    }}>
                      Deploy Now
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
