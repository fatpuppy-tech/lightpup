import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '../../components/atoms/Button'
import { Card } from '../../components/atoms/Card'
import { Input } from '../../components/atoms/Input'
import { Label } from '../../components/atoms/Label'
import { useAuth } from '../../contexts/AuthContext'
import {
  auth2faConfirm,
  auth2faSetup,
  auth2faStatus,
  authChangePassword,
} from '../../lib/api'

export function SettingsProfileTab() {
  const { user } = useAuth()
  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null)
  const [twoFaSetup, setTwoFaSetup] = useState<{
    secret_base32: string
    qr_uri: string
  } | null>(null)
  const [twoFaCode, setTwoFaCode] = useState('')
  const [twoFaConfirming, setTwoFaConfirming] = useState(false)
  const [twoFaError, setTwoFaError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordChanging, setPasswordChanging] = useState(false)

  useEffect(() => {
    auth2faStatus()
      .then((r) => setTwoFaEnabled(r.enabled))
      .catch(() => setTwoFaEnabled(false))
  }, [])

  async function startTwoFaSetup() {
    setTwoFaError('')
    try {
      const data = await auth2faSetup()
      setTwoFaSetup(data)
      setTwoFaCode('')
    } catch (e) {
      setTwoFaError(e instanceof Error ? e.message : 'Failed to start 2FA setup')
    }
  }

  function cancelTwoFaSetup() {
    setTwoFaSetup(null)
    setTwoFaCode('')
    setTwoFaError('')
  }

  async function confirmTwoFa() {
    if (!twoFaCode.trim() || twoFaCode.replace(/\D/g, '').length < 6) return
    setTwoFaError('')
    setTwoFaConfirming(true)
    try {
      await auth2faConfirm(twoFaCode.replace(/\s/g, ''))
      setTwoFaEnabled(true)
      setTwoFaSetup(null)
      setTwoFaCode('')
    } catch (e) {
      setTwoFaError(e instanceof Error ? e.message : 'Invalid code')
    } finally {
      setTwoFaConfirming(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    setPasswordChanging(true)
    try {
      await authChangePassword(currentPassword, newPassword)
      setPasswordSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setPasswordChanging(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6 pt-4">
      <Card>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Account
        </h2>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500">Username</span>
            <span className="font-medium text-zinc-200">{user?.username ?? '—'}</span>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Change password
        </h2>
        <p className="mt-2 text-xs text-zinc-500">
          Set a new password for your account. You will need your current password.
        </p>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-4">
          {passwordError && (
            <p className="text-xs text-rose-400">{passwordError}</p>
          )}
          {passwordSuccess && (
            <p className="text-xs text-emerald-400">Password updated successfully.</p>
          )}
          <div>
            <Label htmlFor="profile-current-password">Current password</Label>
            <Input
              id="profile-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 max-w-xs"
            />
          </div>
          <div>
            <Label htmlFor="profile-new-password">New password</Label>
            <Input
              id="profile-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 max-w-xs"
            />
          </div>
          <div>
            <Label htmlFor="profile-confirm-password">Confirm new password</Label>
            <Input
              id="profile-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 max-w-xs"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={passwordChanging || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
          >
            {passwordChanging ? 'Updating…' : 'Change password'}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Two-factor authentication
        </h2>
        <p className="mt-2 text-xs text-zinc-500">
          Use an authenticator app (e.g. Google Authenticator, Authy) to add a second factor when signing in.
        </p>
        {twoFaError && (
          <p className="mt-2 text-xs text-rose-400">{twoFaError}</p>
        )}
        {twoFaEnabled === true && !twoFaSetup && (
          <p className="mt-3 text-xs text-emerald-400">2FA is enabled for your account.</p>
        )}
        {twoFaEnabled === false && !twoFaSetup && (
          <div className="mt-3">
            <Button type="button" variant="secondary" size="sm" onClick={startTwoFaSetup}>
              Enable 2FA
            </Button>
          </div>
        )}
        {twoFaSetup && (
          <div className="mt-4 space-y-4 rounded-md border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-400">
              Scan the QR code with your authenticator app, or enter the secret manually.
            </p>
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className="rounded-lg border border-zinc-700 bg-white p-2">
                  <QRCodeSVG value={twoFaSetup.qr_uri} size={192} level="M" />
                </div>
                <span className="text-[11px] text-zinc-500">Scan with your app</span>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-[11px] text-zinc-500">Secret (manual entry)</p>
                <code className="block break-all rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300">
                  {twoFaSetup.secret_base32}
                </code>
              </div>
            </div>
            <div>
              <Label htmlFor="settings-profile-2fa-code">Verification code</Label>
              <Input
                id="settings-profile-2fa-code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="mt-1 max-w-[8rem]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={twoFaConfirming || twoFaCode.replace(/\D/g, '').length < 6}
                onClick={confirmTwoFa}
              >
                {twoFaConfirming ? 'Verifying…' : 'Confirm and enable 2FA'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelTwoFaSetup}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
