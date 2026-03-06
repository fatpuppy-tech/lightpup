import { useNavigate } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Label } from '../components/atoms/Label'
import { Input } from '../components/atoms/Input'
import { Button } from '../components/atoms/Button'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import type { Project } from '../lib/api'
import { api } from '../lib/api'
import { useState } from 'react'

export function NewProjectPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name) return
    setSaving(true)
    try {
      const project = await api<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      })
      navigate(`/projects/${project.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={() => navigate('/projects')} trail="New app" />
      </header>
      <PageMain className="max-w-3xl">
        <Card className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-100">Create app</h2>
          <p className="text-xs text-zinc-500">
            An app groups environments (e.g. production, staging) and applications. Give it a short, memorable name and an optional description.
          </p>
          <div className="grid gap-3 md:grid-cols-2 text-xs">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-project"
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving || !name}>
              {saving ? 'Creating…' : 'Create app'}
            </Button>
          </div>
        </Card>
      </PageMain>
    </div>
  )
}

