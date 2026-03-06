import { useEffect, useState } from 'react'
import { Card } from '../../components/atoms/Card'
import { Button } from '../../components/atoms/Button'
import { Input } from '../../components/atoms/Input'
import { Label } from '../../components/atoms/Label'
import { ConfirmModal } from '../../components/molecules/ConfirmModal'
import { api } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'

type CertListItem = {
  domain: string
  is_ssl: boolean
}

type CertificateInfo = {
  domain: string
  expires_at?: string | null
  is_ssl: boolean
}

export function SettingsSSLTab() {
  const { toast } = useToast()
  const [list, setList] = useState<CertListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [provisionDomain, setProvisionDomain] = useState('')
  const [provisionEmail, setProvisionEmail] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [uploadDomain, setUploadDomain] = useState('')
  const [uploadCert, setUploadCert] = useState('')
  const [uploadKey, setUploadKey] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deleteDomain, setDeleteDomain] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function fetchList() {
    try {
      const data = await api<CertListItem[]>('/api/ssl/list')
      setList(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to fetch certificates:', e)
      toast(errMessage(e), 'error')
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [])

  async function handleProvision() {
    const domain = provisionDomain.trim()
    if (!domain) {
      toast('Domain is required', 'error')
      return
    }
    setProvisioning(true)
    try {
      await api<CertificateInfo>('/api/ssl/provision', {
        method: 'POST',
        body: JSON.stringify({
          domain,
          email: provisionEmail.trim() || undefined,
        }),
      })
      toast(`Certificate provisioned for ${domain}. Ensure HTTP challenge is reachable.`, 'success')
      setProvisionDomain('')
      setProvisionEmail('')
      await fetchList()
    } catch (e) {
      toast(errMessage(e), 'error')
    } finally {
      setProvisioning(false)
    }
  }

  async function handleUpload() {
    const domain = uploadDomain.trim()
    if (!domain) {
      toast('Domain is required', 'error')
      return
    }
    if (!uploadCert.trim()) {
      toast('Certificate PEM is required', 'error')
      return
    }
    if (!uploadKey.trim()) {
      toast('Private key PEM is required', 'error')
      return
    }
    setUploading(true)
    try {
      await api<CertificateInfo>('/api/ssl/upload', {
        method: 'POST',
        body: JSON.stringify({
          domain,
          cert_pem: uploadCert.trim(),
          key_pem: uploadKey.trim(),
        }),
      })
      toast(`Certificate uploaded for ${domain}`, 'success')
      setUploadDomain('')
      setUploadCert('')
      setUploadKey('')
      await fetchList()
    } catch (e) {
      toast(errMessage(e), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!deleteDomain) return
    setDeleting(true)
    try {
      await api(`/api/ssl/delete/${encodeURIComponent(deleteDomain)}`, {
        method: 'DELETE',
      })
      toast(`Certificate for ${deleteDomain} deleted`, 'success')
      setDeleteDomain(null)
      await fetchList()
    } catch (e) {
      toast(errMessage(e), 'error')
    } finally {
      setDeleting(false)
    }
  }

  function errMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'Something went wrong'
  }

  return (
    <div className="space-y-6 pt-4">
      <Card>
        <h3 className="text-sm font-semibold text-zinc-100">Certificates</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Manage TLS certificates for your domains. Provision via Let&apos;s Encrypt (ACME) or upload
          your own certificate and private key.
        </p>
        {loading ? (
          <p className="mt-4 text-xs text-zinc-500">Loading…</p>
        ) : list.length === 0 ? (
          <p className="mt-4 text-xs text-zinc-500">No certificates yet. Provision or upload one below.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {list.map((c) => (
              <li
                key={c.domain}
                className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2"
              >
                <span className="font-mono text-sm text-zinc-200">{c.domain}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-rose-400"
                  onClick={() => setDeleteDomain(c.domain)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-zinc-100">Provision with Let&apos;s Encrypt</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Request a free certificate. Your domain must point to this server and HTTP (port 80) must
          be reachable for the ACME challenge.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px]">
            <Label>Domain</Label>
            <Input
              value={provisionDomain}
              onChange={(e) => setProvisionDomain(e.target.value)}
              placeholder="app.example.com"
              className="mt-1"
            />
          </div>
          <div className="min-w-[200px]">
            <Label>Email (optional)</Label>
            <Input
              type="email"
              value={provisionEmail}
              onChange={(e) => setProvisionEmail(e.target.value)}
              placeholder="admin@example.com"
              className="mt-1"
            />
          </div>
          <Button onClick={handleProvision} disabled={provisioning}>
            {provisioning ? 'Provisioning…' : 'Provision'}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-zinc-100">Upload certificate</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Paste an existing certificate (PEM) and private key for a domain.
        </p>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Domain</Label>
            <Input
              value={uploadDomain}
              onChange={(e) => setUploadDomain(e.target.value)}
              placeholder="app.example.com"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Certificate (PEM)</Label>
            <textarea
              value={uploadCert}
              onChange={(e) => setUploadCert(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----..."
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-600"
              rows={4}
            />
          </div>
          <div>
            <Label>Private key (PEM)</Label>
            <textarea
              value={uploadKey}
              onChange={(e) => setUploadKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----..."
              className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono text-zinc-300 placeholder:text-zinc-600"
              rows={4}
            />
          </div>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </Card>

      <ConfirmModal
        open={deleteDomain !== null}
        title="Remove certificate"
        message={
          deleteDomain ? (
            <>Remove the certificate for <span className="font-mono">{deleteDomain}</span>? This cannot be undone.</>
          ) : (
            ''
          )
        }
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDomain(null)}
        variant="danger"
        loading={deleting}
      />
    </div>
  )
}
