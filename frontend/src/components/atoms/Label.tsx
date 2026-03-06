import type { LabelHTMLAttributes, ReactNode } from 'react'

export type LabelProps = {
  children: ReactNode
} & LabelHTMLAttributes<HTMLLabelElement>

export function Label({ className = '', children, ...props }: LabelProps) {
  const base = 'block text-xs font-medium text-zinc-400'
  const classes = [base, className].filter(Boolean).join(' ')

  return (
    <label className={classes} {...props}>
      {children}
    </label>
  )
}

