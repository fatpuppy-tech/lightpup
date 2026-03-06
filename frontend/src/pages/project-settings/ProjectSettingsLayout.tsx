import { useEffect, useState } from 'react'
import { NavLink, Outlet, useParams, useLocation, useNavigate } from 'react-router-dom'
import { Breadcrumbs } from '../../components/molecules/Breadcrumbs'
import { PageMain } from '../../components/layout/PageMain'
import { useAuth } from '../../contexts/AuthContext'
import type { Project } from '../../lib/api'
import { api, canEdit } from '../../lib/api'

const tabLabels: Record<string, string> = {
  members: 'Members',
  env: 'Environment variables',
}

const tabs = [
  { to: 'members', label: 'Members' },
  { to: 'env', label: 'Environment variables' },
] as const

export function ProjectSettingsLayout() {
  const { projectId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    if (!projectId) return
    api<Project>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch(() => setProject(null))
  }, [projectId])

  useEffect(() => {
    if (!canEdit(user) && projectId) {
      navigate(`/projects/${projectId}`, { replace: true })
    }
  }, [user, projectId, navigate])

  const pathPart = location.pathname.split('/settings/')[1]?.split('/')[0] ?? 'members'
  const currentTabLabel = tabLabels[pathPart] ?? 'Settings'

  if (!projectId) return null

  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    { label: project?.name ?? 'Project', href: `/projects/${projectId}` },
    { label: 'Settings', href: `/projects/${projectId}/settings` },
    { label: currentTabLabel },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-4 sm:px-6 md:px-8">
        <Breadcrumbs items={breadcrumbItems} />
      </header>
      <div className="px-4 sm:px-6 lg:px-8">
        <nav className="mb-2 flex gap-2 border-b border-zinc-800 text-sm" aria-label="Project settings tabs">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={false}
              className={({ isActive }) =>
                `-mb-px cursor-pointer border-b px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-100'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <PageMain className="max-w-3xl flex-1">
        <Outlet />
      </PageMain>
    </div>
  )
}
