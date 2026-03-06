import type { ReactNode } from 'react'
import { Card } from '../atoms/Card'

const iconClass = 'mx-auto h-12 w-12 text-zinc-600'

const EmptyIcons = {
  default: () => (
    <svg
      className={iconClass}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  ),
  project: () => (
    <svg
      className={iconClass}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  ),
  server: () => (
    <svg
      className={iconClass}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      />
    </svg>
  ),
  app: () => (
    <svg
      className={iconClass}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  ),
  deployment: () => (
    <svg
      className={iconClass}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  ),
  environment: () => (
    <svg
      className={iconClass}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
      />
    </svg>
  ),
} as const

export type EmptyStateVariant = keyof typeof EmptyIcons

export type EmptyStateProps = {
  /** Short heading (e.g. "No projects yet") */
  title: string
  /** Optional supporting line */
  description?: string
  /** Optional primary action (button or link) */
  action?: ReactNode
  /** Icon variant for context (project, server, app, deployment) or custom node */
  icon?: EmptyStateVariant | ReactNode
  /** Optional extra class on the wrapper */
  className?: string
}

function isVariant(
  icon: EmptyStateProps['icon']
): icon is EmptyStateVariant {
  return typeof icon === 'string' && icon in EmptyIcons
}

export function EmptyState({
  title,
  description,
  action,
  icon = 'default',
  className = '',
}: EmptyStateProps) {
  const iconEl =
    icon === undefined || isVariant(icon)
      ? EmptyIcons[icon ?? 'default']()
      : icon

  return (
    <Card
      className={`flex flex-col items-center justify-center py-16 px-8 text-center ${className}`}
    >
      <div className="flex flex-col items-center gap-3 max-w-sm">
        {iconEl}
        <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
        {description && (
          <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
        )}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </Card>
  )
}
