import type { InputHTMLAttributes } from 'react'

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  fullWidth?: boolean
}

export function Input({
  className = '',
  fullWidth = true,
  type = 'text',
  ...props
}: InputProps) {
  const base =
    'rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500'

  const width = fullWidth ? 'w-full' : ''

  const classes = [base, width, className].filter(Boolean).join(' ')

  return <input type={type} className={classes} {...props} />
}

