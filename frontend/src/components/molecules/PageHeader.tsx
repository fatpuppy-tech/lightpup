import type { ReactNode } from 'react'
import { Button } from '../atoms/Button'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5 md:px-8 md:py-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
        {description && (
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function PageHeaderBack({
  onBack,
  trail,
}: {
  onBack: () => void
  trail?: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
      <Button
        variant="ghost"
        size="sm"
        className="px-0 text-xs text-zinc-400 hover:text-zinc-100"
        onClick={onBack}
      >
        ← Back
      </Button>
      {trail && (
        <>
          <span>/</span>
          <span className="truncate">{trail}</span>
        </>
      )}
    </div>
  )
}

