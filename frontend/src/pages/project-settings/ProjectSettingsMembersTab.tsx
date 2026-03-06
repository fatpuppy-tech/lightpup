import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../../components/atoms/Button'
import { Card } from '../../components/atoms/Card'
import { Label } from '../../components/atoms/Label'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { ProjectMemberInfo } from '../../lib/api'
import {
  addProjectMember,
  isAdmin,
  listProjectMembers,
  listUsers,
  removeProjectMember,
} from '../../lib/api'

const ROLE_LABELS: Record<string, string> = {
  viewer: 'Viewer',
  member: 'Member',
  admin: 'Admin',
}

const ROLE_STYLES: Record<string, string> = {
  viewer: 'bg-zinc-700/80 text-zinc-300',
  member: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50',
  admin: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
}

export function ProjectSettingsMembersTab() {
  const { projectId } = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const [members, setMembers] = useState<ProjectMemberInfo[]>([])
  const [users, setUsers] = useState<{ id: string; username: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const admin = isAdmin(user)

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      listProjectMembers(projectId),
      admin ? listUsers().then((u) => u.map((x) => ({ id: x.id, username: x.username }))) : Promise.resolve([]),
    ])
      .then(([membersList, usersList]) => {
        setMembers(membersList)
        setUsers(usersList)
      })
      .catch(() => {
        toast('Failed to load members', 'error')
      })
      .finally(() => setLoading(false))
  }, [projectId, admin, toast])

  const availableUsers = users.filter((u) => !members.some((m) => m.user_id === u.id))

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectId || !addUserId) return
    setAdding(true)
    try {
      const added = await addProjectMember(projectId, addUserId, addRole)
      setMembers((prev) => [...prev, added])
      setAddUserId('')
      setAddRole('member')
      toast(`${added.username} added as ${ROLE_LABELS[added.role] ?? added.role}`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add member', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (member: ProjectMemberInfo) => {
    if (!projectId) return
    setRemovingId(member.user_id)
    try {
      await removeProjectMember(projectId, member.user_id)
      setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id))
      toast(`${member.username} removed from project`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove member', 'error')
    } finally {
      setRemovingId(null)
    }
  }

  if (!projectId) return null

  return (
    <div className="space-y-8 pt-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">Members</h2>
        <p className="mt-1 text-sm text-zinc-500 max-w-xl">
          People with access to this project. <span className="text-zinc-400">Viewer</span> — read-only.
          <span className="text-emerald-400/90"> Member</span> — can deploy and edit applications.
          <span className="text-amber-400/90"> Admin</span> — can manage members and settings.
        </p>
      </div>

      {admin && availableUsers.length > 0 && (
        <Card className="border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
            Add member
          </h3>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-4">
            <div className="min-w-0">
              <Label htmlFor="project-add-user" className="text-zinc-400">
                User
              </Label>
              <select
                id="project-add-user"
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                className="mt-1.5 block w-48 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              >
                <option value="">Choose user…</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="project-add-role" className="text-zinc-400">
                Role
              </Label>
              <select
                id="project-add-role"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="mt-1.5 block w-32 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button type="submit" size="sm" disabled={!addUserId || adding} className="mb-0.5">
              {adding ? 'Adding…' : 'Add member'}
            </Button>
          </form>
        </Card>
      )}

      <Card className="border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">Loading members…</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-500">No members yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Only instance admins can add users to this project.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium text-zinc-300">
                    {(m.username.slice(0, 2) || '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-100">{m.username}</p>
                    <span
                      className={`inline-block mt-0.5 rounded-md px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[m.role] ?? ROLE_STYLES.member}`}
                    >
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </div>
                </div>
                {admin && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removingId === m.user_id}
                    onClick={() => handleRemove(m)}
                    className="shrink-0 text-zinc-400 hover:text-zinc-100"
                  >
                    {removingId === m.user_id ? 'Removing…' : 'Remove'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
