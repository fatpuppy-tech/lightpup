import type { HTMLAttributes } from 'react'
import { Card } from '../atoms/Card'
import type { Project } from '../../lib/api'

const ProjectIconBg = () => (
  <svg
    className="h-32 w-32 text-zinc-700/25"
    viewBox="0 0 640 640"
    fill="currentColor"
    aria-hidden
  >
    <path d="M96 176C96 149.5 117.5 128 144 128H272L320 176H496C522.5 176 544 197.5 544 224V464C544 490.5 522.5 512 496 512H144C117.5 512 96 490.5 96 464V176Z" />
  </svg>
)

type ProjectCardProps = {
  project: Project
} & HTMLAttributes<HTMLDivElement>

export function ProjectCard({ project, className = '', ...rest }: ProjectCardProps) {
  const baseClasses =
    'relative h-full overflow-hidden border-zinc-800/80 bg-zinc-900/70 transition-colors hover:border-emerald-500 hover:bg-zinc-800/80'

  return (
    <Card className={[baseClasses, className].filter(Boolean).join(' ')} {...rest}>
      <div
        className="pointer-events-none absolute -bottom-10 -right-10"
        aria-hidden
      >
        <ProjectIconBg />
      </div>
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-100">
              {project.name}
            </h3>
            <span className="hidden text-[11px] uppercase tracking-wide text-zinc-500 group-hover:text-emerald-400 md:inline">
              View
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
            {project.description || 'No description yet.'}
          </p>
          <div className="mt-2 text-[11px] text-zinc-600">
            <span className="text-zinc-500">ID:</span>{' '}
            <span className="font-mono">{project.id}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

