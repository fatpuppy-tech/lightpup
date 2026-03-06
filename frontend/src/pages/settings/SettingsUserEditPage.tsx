import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/atoms/Button'
import { Card } from '../../components/atoms/Card'
import { Label } from '../../components/atoms/Label'
import { Breadcrumbs } from '../../components/molecules/Breadcrumbs'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { UserInfo } from '../../lib/api'
import {
  getUser,
  listUsers,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  setUserPermissions,
  updateUserRole,
  isAdmin,
} from '../../lib/api'

export function SettingsUserEditPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const toast = useToast()
  const [targetUser, setTargetUser] = useState<UserInfo | null>(null)
  const [adminCount, setAdminCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [role, setRole] = useState<string>('')
  const [permissions, setPermissions] = useState<string[]>([])

  useEffect(() => {
    if (!userId || !isAdmin(currentUser)) return
    setLoading(true)
    Promise.all([getUser(userId), listUsers()])
      .then(([user, users]) => {
        setTargetUser(user)
        setRole(user.role)
        setPermissions(user.permissions ?? [])
        setAdminCount(users.filter((u) => u.role === 'admin').length)
      })
      .catch(() => {
        setTargetUser(null)
      })
      .finally(() => setLoading(false))
  }, [userId, currentUser])

  if (!isAdmin(currentUser)) {
    return (
      <div className="pt-4">
        <p className="text-sm text-zinc-500">You need admin role to edit users.</p>
      </div>
    )
  }

  if (!userId) return null

  const isSelf = targetUser?.id === currentUser?.id
  const isOnlyAdmin = targetUser?.role === 'admin' && adminCount <= 1
  const roleDisabled = isSelf || isOnlyAdmin
  const permissionKeys = Object.values(PERMISSION_KEYS)
  const hasChanges =
    targetUser &&
    (role !== targetUser.role ||
      JSON.stringify([...permissions].sort()) !==
        JSON.stringify([...(targetUser.permissions ?? [])].sort()))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetUser || !hasChanges || saving) return
    setSaving(true)
    try {
      if (role !== targetUser.role) {
        await updateUserRole(targetUser.id, role)
      }
      if (
        JSON.stringify([...permissions].sort()) !==
        JSON.stringify([...(targetUser.permissions ?? [])].sort())
      ) {
        await setUserPermissions(targetUser.id, permissions)
      }
      toast('Permissions saved', 'success')
      navigate('/settings/users')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const togglePermission = (key: string, checked: boolean) => {
    setPermissions((prev) =>
      checked ? [...prev, key] : prev.filter((p) => p !== key)
    )
  }

  if (loading && !targetUser) {
    return (
      <div className="pt-4">
        <p className="text-sm text-zinc-500">Loading user…</p>
      </div>
    )
  }

  if (!targetUser) {
    return (
      <div className="pt-4 space-y-3">
        <p className="text-sm text-zinc-500">User not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/settings/users')}>
          Back to users
        </Button>
      </div>
    )
  }

  const breadcrumbs = [
    { label: 'Settings', href: '/settings' },
    { label: 'Users', href: '/settings/users' },
    { label: targetUser.username },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/users')}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>

      <Card
        className={`p-6 ${isSelf ? 'border-amber-800/60 bg-amber-950/10' : ''}`}
      >
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-zinc-100">{targetUser.username}</h1>
          {isSelf && (
            <span className="rounded bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-300">
              You
            </span>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          <section>
            <Label className="text-zinc-300">Role</Label>
            <p className="mt-1 mb-3 text-xs text-zinc-500">
              {isSelf
                ? 'You cannot change your own role. Ask another admin to do it.'
                : isOnlyAdmin
                  ? 'Cannot remove the last admin. Promote another user to admin first.'
                  : 'Base access level. Extra permissions below add on top of this.'}
            </p>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={roleDisabled}
              className="block w-48 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </section>

          <section className="border-t border-zinc-800 pt-8">
            <h2 className="text-sm font-semibold text-zinc-200">Extra permissions</h2>
            <p className="mt-1 mb-4 text-xs text-zinc-500">
              Grant specific capabilities on top of role. Admins and members already
              have most of these by default.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {permissionKeys.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-800/50 px-4 py-3 transition-colors hover:bg-zinc-800/80"
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(key)}
                    onChange={(e) => togglePermission(key, e.target.checked)}
                    className="mt-0.5 shrink-0 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/30"
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-200">
                      {PERMISSION_LABELS[key] ?? key}
                    </span>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {PERMISSION_DESCRIPTIONS[key] ?? ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <div className="flex gap-2 border-t border-zinc-800 pt-6">
            <Button type="submit" disabled={!hasChanges || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/settings/users')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
