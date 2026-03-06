import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

export type ButtonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', className = '', children, ...props },
    ref,
  ) {
    const base =
      'inline-flex cursor-pointer items-center justify-center rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors'

    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400',
      secondary:
        'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700',
      outline:
        'border border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-900',
      ghost: 'bg-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100',
      danger: 'bg-rose-600 text-zinc-50 hover:bg-rose-500',
    }

    const sizes: Record<ButtonSize, string> = {
      sm: 'px-3 py-1 text-xs',
      md: 'px-4 py-1.5 text-sm',
    }

    const classes = [base, variants[variant], sizes[size], className]
      .filter(Boolean)
      .join(' ')

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  },
)

