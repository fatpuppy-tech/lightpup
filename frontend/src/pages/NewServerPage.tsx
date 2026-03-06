import { useNavigate } from 'react-router-dom'
import { Card } from '../components/atoms/Card'
import { Label } from '../components/atoms/Label'
import { Input } from '../components/atoms/Input'
import { Button } from '../components/atoms/Button'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import type { Server } from '../lib/api'
import { api } from '../lib/api'
import { useState } from 'react'

export function NewServerPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [sshKeyContent, setSshKeyContent] = useState('')
  const [useKeyContent, setUseKeyContent] = useState(false)
  const [saving, setSaving] = useState(false)

  const isLocalhost = address.toLowerCase() === 'localhost' || address === '127.0.0.1'

  async function save() {
    if (!name || !address) return
    setSaving(true)
    try {
      const server = await api<Server>('/api/servers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          address,
          is_active: true,
          ssh_user: isLocalhost ? null : (sshUser || null),
          ssh_key_path: isLocalhost ? null : (useKeyContent ? null : (sshKeyPath || null)),
          ssh_key_content: isLocalhost ? null : (useKeyContent ? sshKeyContent : null),
        }),
      })
      navigate(`/servers/${server.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={() => navigate('/servers')} trail="New server" />
      </header>
      <PageMain className="max-w-3xl">
        <Card className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-100">Add deployment server</h2>
          <p className="text-xs text-zinc-500">
            Define a host that LightPup can deploy to and open a terminal on. For local Docker,
            use <span className="font-mono text-[11px]">localhost</span>. For remote hosts, provide SSH details.
          </p>
          <div className="grid gap-3 md:grid-cols-2 text-xs">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production-1"
              />
            </div>
            <div className="space-y-1">
              <Label>Host / IP</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="localhost or 10.0.0.5"
              />
            </div>
          </div>
          
          {isLocalhost ? (
            <div className="p-3 bg-zinc-900 rounded border border-zinc-800">
              <p className="text-xs text-zinc-400">
                ✓ Localhost detected - SSH not required. The server will use the local Docker daemon.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2 text-xs">
                <div className="space-y-1">
                  <Label>SSH username</Label>
                  <Input
                    value={sshUser}
                    onChange={(e) => setSshUser(e.target.value)}
                    placeholder="deploy"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useKeyContent"
                    checked={useKeyContent}
                    onChange={(e) => setUseKeyContent(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700"
                  />
                  <Label htmlFor="useKeyContent" className="text-zinc-300! m-0">
                    Paste private key directly
                  </Label>
                </div>
                
                {useKeyContent ? (
                  <div className="space-y-1">
                    <Label>SSH Private Key</Label>
                    <textarea
                      value={sshKeyContent}
                      onChange={(e) => setSshKeyContent(e.target.value)}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                      className="w-full h-32 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs font-mono text-zinc-300 resize-y"
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>SSH key path</Label>
                    <Input
                      value={sshKeyPath}
                      onChange={(e) => setSshKeyPath(e.target.value)}
                      placeholder="~/.ssh/id_ed25519"
                    />
                  </div>
                )}
              </div>
            </>
          )}
          
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving || !name || !address}>
              {saving ? 'Saving…' : 'Save server'}
            </Button>
          </div>
        </Card>
      </PageMain>
    </div>
  )
}
