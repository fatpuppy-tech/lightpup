import { useNavigate, useParams } from 'react-router-dom'
import { PageHeaderBack } from '../components/molecules/PageHeader'
import { ApplicationForm } from '../components/organisms/ApplicationForm'
import { PageMain } from '../components/layout/PageMain'
import { api } from '../lib/api'

export function NewApplicationPage() {
  const { envId } = useParams()
  const navigate = useNavigate()

  if (!envId) return null

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-8 py-6">
        <PageHeaderBack onBack={() => navigate(-1)} trail="New application" />
      </header>
      <PageMain>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="mb-4 text-sm font-semibold text-zinc-100">
            New Application
          </h2>
          <ApplicationForm
            onSubmit={async (payload) => {
              await api(`/api/environments/${envId}/applications`, {
                method: 'POST',
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

