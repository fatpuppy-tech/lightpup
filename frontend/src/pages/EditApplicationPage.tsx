import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { ApplicationForm } from '../components/organisms/ApplicationForm'
import { PageMain } from '../components/layout/PageMain'
import type { Application } from '../lib/api'
import { api } from '../lib/api'

export function EditApplicationPage() {
  const { envId, appId } = useParams()
  const navigate = useNavigate()
  const [app, setApp] = useState<Application | null>(null)

  useEffect(() => {
    if (!appId) return
    api<Application>(`/api/applications/${appId}`).then(setApp)
  }, [appId])

  if (!envId || !appId || !app) return null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={() => navigate(-1)} trail={`Edit ${app.name}`} />
      </header>
      <PageMain>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-4 text-sm font-semibold text-zinc-100">
            Edit Application
          </h2>
          <ApplicationForm
            initial={app}
            onSubmit={async (payload) => {
              await api(`/api/applications/${appId}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
              })
              navigate(-1)
            }}
          />
        </div>
      </PageMain>
    </div>
  )
}

