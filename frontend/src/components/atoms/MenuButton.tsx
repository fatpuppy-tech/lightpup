import type { ButtonHTMLAttributes } from 'react'

export type MenuButtonProps = {
  'aria-expanded'?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>

export function MenuButton({
  'aria-expanded': ariaExpanded = false,
  className = '',
  ...props
}: MenuButtonProps) {
  return (
    <button
      type="button"
      aria-label="Open menu"
      aria-expanded={ariaExpanded}
      className={`inline-flex cursor-pointer flex-col justify-center gap-1 rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${className}`}
      {...props}
    >
      <span className="block h-0.5 w-5 rounded-full bg-current" />
      <span className="block h-0.5 w-5 rounded-full bg-current" />
      <span className="block h-0.5 w-5 rounded-full bg-current" />
    </button>
  )
}
