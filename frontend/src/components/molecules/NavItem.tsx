import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export type NavItemProps = {
  to: string
  end?: boolean
  icon: ReactNode
  children: ReactNode
  onClick?: () => void
}

export function NavItem({ to, end, icon, children, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex cursor-pointer items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`
      }
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  )
}
