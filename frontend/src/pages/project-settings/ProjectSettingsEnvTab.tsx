import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../../components/atoms/Button'
import { Card } from '../../components/atoms/Card'
import { Input } from '../../components/atoms/Input'
import { Label } from '../../components/atoms/Label'
import { useToast } from '../../contexts/ToastContext'
import type { EnvVarItem } from '../../lib/api'
import {
  deleteProjectEnv,
  listProjectEnv,
  setProjectEnv,
} from '../../lib/api'

export function ProjectSettingsEnvTab() {
  const { projectId } = useParams()
  const { toast } = useToast()
  const [vars, setVars] = useState<EnvVarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    listProjectEnv(projectId)
      .then(setVars)
      .catch(() => toast('Failed to load environment variables', 'error'))
      .finally(() => setLoading(false))
  }, [projectId, toast])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !newKey.trim()) return
    setAdding(true)
    try {
      const added = await setProjectEnv(projectId, newKey.trim(), newValue)
      setVars((prev) => {
        const without = prev.filter((x) => x.key !== added.key)
        return [...without, added].sort((a, b) => a.key.localeCompare(b.key))
      })
      setNewKey('')
      setNewValue('')
      toast('Variable added', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add variable', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (key: string) => {
    if (!projectId) return
    setDeletingKey(key)
    try {
      await deleteProjectEnv(projectId, key)
      setVars((prev) => prev.filter((x) => x.key !== key))
      toast('Variable removed', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove variable', 'error')
    } finally {
      setDeletingKey(null)
    }
  }

  if (!projectId) return null

  return (
    <div className="space-y-8 pt-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">
          Environment variables
        </h2>
        <p className="mt-1 text-sm text-zinc-500 max-w-xl">
          Injected into every container for applications in this project. Application-level variables override with the same key.
        </p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
          Add variable
        </h3>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <Label htmlFor="env-key" className="text-zinc-400">
              Key
            </Label>
            <Input
              id="env-key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="e.g. NODE_ENV"
              className="mt-1.5 w-44 font-mono text-sm bg-zinc-800/80 border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500/30"
              autoComplete="off"
            />
          </div>
          <div className="min-w-0 flex-1 min-w-[200px]">
            <Label htmlFor="env-value" className="text-zinc-400">
              Value
            </Label>
            <Input
              id="env-value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="e.g. production"
              className="mt-1.5 w-full font-mono text-sm bg-zinc-800/80 border-zinc-700 focus:border-emerald-500 focus:ring-emerald-500/30"
              autoComplete="off"
            />
          </div>
          <Button type="submit" size="sm" disabled={!newKey.trim() || adding} className="mb-0.5">
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </Card>

      <Card className="border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
        ) : vars.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-500">No variables yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Add keys above; they will be available in deployed containers.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Key
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Value
                  </th>
                  <th className="w-24 px-5 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {vars.map(({ key, value }) => (
                  <tr
                    key={key}
                    className="hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-zinc-100">
                      {key}
                    </td>
                    <td className="px-5 py-3 font-mono text-zinc-400 truncate max-w-[280px]">
                      {value}
                    </td>
                    <td className="px-5 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingKey === key}
                        onClick={() => handleDelete(key)}
                        className="text-zinc-500 hover:text-rose-400"
                      >
                        {deletingKey === key ? '…' : 'Remove'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
