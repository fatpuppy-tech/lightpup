import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../components/atoms/Card'
import { Button } from '../../components/atoms/Button'
import { Input } from '../../components/atoms/Input'
import { Label } from '../../components/atoms/Label'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { UserInfo } from '../../lib/api'
import { createInvite, createUser, listUsers, isAdmin } from '../../lib/api'

export function SettingsUsersTab() {
  const { user } = useAuth()
  const toast = useToast()
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<string>('member')
  const [saving, setSaving] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('member')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    if (!isAdmin(user)) return
    listUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false))
  }, [user])

  if (!isAdmin(user)) {
    return (
      <div className="pt-4">
        <p className="text-sm text-zinc-500">You need admin role to manage users.</p>
      </div>
    )
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const u = username.trim()
    if (!u || password.length < 8) {
      toast('Username and password (min 8 chars) required', 'error')
      return
    }
    setSaving(true)
    try {
      const created = await createUser({ username: u, password, role })
      setUsers((prev) => [created, ...prev])
      setUsername('')
      setPassword('')
      setRole('member')
      toast('User created', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create user', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const u = inviteUsername.trim()
    if (!u) {
      toast('Username required for invite', 'error')
      return
    }
    setInviteLoading(true)
    setInviteLink(null)
    try {
      const res = await createInvite({
        username: u,
        role: inviteRole,
        email: inviteEmail.trim() || undefined,
        expires_in_days: 7,
      })
      setInviteLink(res.invite_link)
      setInviteUsername('')
      setInviteEmail('')
      setInviteRole('member')
      toast('Invite link created. Share it with the user.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create invite', 'error')
    } finally {
      setInviteLoading(false)
    }
  }

  const copyInviteLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink).then(
      () => toast('Link copied to clipboard', 'success'),
      () => toast('Failed to copy', 'error')
    )
  }

  return (
    <div className="space-y-4 pt-4">
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Users</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Add users and invites here. Use “Edit permissions” to set each user’s role and
          fine-grained permissions (e.g. terminal access) on a dedicated page.
        </p>

        <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="mt-1 w-40"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="new-password">Password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 8 characters"
              className="mt-1 w-44"
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="new-role">Role</Label>
            <select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Adding…' : 'Add user'}
          </Button>
        </form>

        <div className="mt-6 border-t border-zinc-800 pt-6">
          <h3 className="text-sm font-semibold text-zinc-100">Invite by link</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Generate a link for someone to set their password and join. Link expires in 7 days.
          </p>
          <form onSubmit={handleCreateInvite} className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="invite-username">Username</Label>
              <Input
                id="invite-username"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="username"
                className="mt-1 w-40"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="mt-1 block w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <Label htmlFor="invite-email">Email (optional)</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="mt-1 w-48"
                autoComplete="off"
              />
            </div>
            <Button type="submit" size="sm" disabled={inviteLoading || !inviteUsername.trim()}>
              {inviteLoading ? 'Generating…' : 'Generate invite link'}
            </Button>
          </form>
          {inviteLink && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={inviteLink}
                className="flex-1 min-w-0 font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={copyInviteLink}>
                Copy link
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading users…</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {users.map((u) => {
              const isSelf = u.id === user?.id
              return (
                <li
                  key={u.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    isSelf
                      ? 'border-amber-800/60 bg-amber-950/20'
                      : 'border-zinc-800 bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-100">{u.username}</span>
                    {isSelf && (
                      <span className="rounded bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-300">
                        You
                      </span>
                    )}
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-amber-900/50 text-amber-300'
                          : u.role === 'member'
                            ? 'bg-emerald-900/50 text-emerald-300'
                            : 'bg-zinc-700/80 text-zinc-400'
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                  <Link
                    to={`/settings/users/${u.id}`}
                    className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    Edit permissions
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
