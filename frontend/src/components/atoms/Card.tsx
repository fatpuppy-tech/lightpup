import type { HTMLAttributes, ReactNode } from 'react'

export type CardProps = {
  children: ReactNode
} & HTMLAttributes<HTMLDivElement>

export function Card({ className = '', children, ...props }: CardProps) {
  const base =
    'rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 shadow-sm shadow-black/20'
  const classes = [base, className].filter(Boolean).join(' ')

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  )
}

