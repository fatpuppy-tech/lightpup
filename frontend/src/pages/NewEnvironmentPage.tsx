import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Label } from '../components/atoms/Label'
import { Input } from '../components/atoms/Input'
import { Button } from '../components/atoms/Button'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import type { Environment, Project } from '../lib/api'
import { api } from '../lib/api'

export function NewEnvironmentPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [isProduction, setIsProduction] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!projectId) return
    api<Project>(`/api/projects/${projectId}`).then(setProject).catch(() => {
      setProject(null)
    })
  }, [projectId])

  const derivedIsProduction = useMemo(() => {
    if (name.trim().toLowerCase() === 'production') return true
    return isProduction
  }, [isProduction, name])

  async function save() {
    if (!projectId) return
    if (!name.trim()) return
    setSaving(true)
    try {
      await api<Environment>(`/api/projects/${projectId}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), is_production: derivedIsProduction }),
      })
      navigate(`/projects/${projectId}`)
    } finally {
      setSaving(false)
    }
  }

  if (!projectId) return null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack
          onBack={() => navigate(`/projects/${projectId}`)}
          trail={`New environment${project?.name ? ` · ${project.name}` : ''}`}
        />
      </header>
      <PageMain className="max-w-3xl">
        <Card className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-100">Create environment</h2>
          <p className="text-xs text-zinc-500">
            Environments separate configuration and deployments (e.g. production, staging).
          </p>

          <div className="grid gap-3 md:grid-cols-2 text-xs">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production"
              />
            </div>
            <div className="space-y-2">
              <Label>Flags</Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isProduction"
                  checked={derivedIsProduction}
                  onChange={(e) => setIsProduction(e.target.checked)}
                  disabled={name.trim().toLowerCase() === 'production'}
                  className="rounded bg-zinc-800 border-zinc-700"
                />
                <Label htmlFor="isProduction" className="text-zinc-300! m-0">
                  Production
                </Label>
              </div>
              {name.trim().toLowerCase() === 'production' && (
                <p className="text-[11px] text-zinc-500">
                  Name “production” is always treated as production.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create environment'}
            </Button>
          </div>
        </Card>
      </PageMain>
    </div>
  )
}

