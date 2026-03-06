import type { HTMLAttributes, ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted'

export type BadgeProps = {
  variant?: BadgeVariant
  children: ReactNode
} & HTMLAttributes<HTMLSpanElement>

export function Badge({
  variant = 'default',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize'

  const variants: Record<BadgeVariant, string> = {
    default: 'bg-zinc-800 text-zinc-100',
    success: 'bg-emerald-500/10 text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-400',
    danger: 'bg-rose-500/10 text-rose-400',
    muted: 'bg-zinc-800 text-zinc-400',
  }

  const classes = [base, variants[variant], className].filter(Boolean).join(' ')

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  )
}

