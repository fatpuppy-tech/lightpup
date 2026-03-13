import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { CardSkeleton } from '../components/molecules/CardSkeleton'
import { EmptyState } from '../components/molecules/EmptyState'
import { PageHeader } from '../components/molecules/PageHeader'
import { PageMain } from '../components/layout/PageMain'
import { ProjectCard } from '../components/molecules/ProjectCard'
import { useAuth } from '../contexts/AuthContext'
import { useAsyncData } from '../hooks/useAsyncData'
import type { Project } from '../lib/api'
import { api, canEdit } from '../lib/api'
import { Input } from '../components/atoms/Input'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const editable = canEdit(user)
  const { data, loading, error, retry } = useAsyncData(
    () => api<Project[]>('/api/projects'),
    []
  )
  const projects = data ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    )
  }, [projects, search])

  return (
    <div className="flex-1 min-h-screen bg-zinc-950 flex flex-col">
      <PageHeader
        title="Projects"
        description="Your projects and their environments. Each project has environments (e.g. production, staging) and deployable applications."
        actions={
          <Button onClick={() => navigate('/projects/new')} size="md" disabled={!editable}>
            New project
          </Button>
        }
      />
      <PageMain>
        {!loading && projects.length > 0 && (
          <div className="mb-4 max-w-xs">
            <Input
              type="search"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>
        )}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="project"
            title={projects.length === 0 ? 'No projects yet' : 'No matching projects'}
            description={
              projects.length === 0
                ? 'Create a project to add environments and deploy applications.'
                : 'Try a different search.'
            }
            action={
              projects.length === 0 ? (
                <Button onClick={() => navigate('/projects/new')} size="md">
                  New project
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="block cursor-pointer group"
              >
                <ProjectCard project={p} />
              </Link>
            ))}
          </div>
        )}
      </PageMain>
    </div>
  )
}

