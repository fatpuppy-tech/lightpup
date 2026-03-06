import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { navEntries } from '../../config/nav'
import { NavItem } from '../molecules/NavItem'

export type MobileMenuProps = {
  isOpen: boolean
  onClose: () => void
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const handleLogout = async () => {
    onClose()
    await logout()
    navigate('/login')
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 cursor-pointer bg-zinc-950/80 backdrop-blur-sm md:hidden"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-zinc-800 bg-zinc-900 px-4 py-6 md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="mb-6 border-b border-zinc-800 pb-4">
          <h1 className="text-lg font-semibold tracking-tight">
            Light<span className="text-emerald-400">Pup</span>
          </h1>
        </div>
        <nav className="flex-1 space-y-1">
          {navEntries.map(({ to, end, label, icon }) => (
            <NavItem key={to} to={to} end={end} icon={icon} onClick={onClose}>
              {label}
            </NavItem>
          ))}
        </nav>
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <button
            type="button"
            onClick={handleLogout}
            className="cursor-pointer rounded-md px-3 py-2 text-left text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            Log out
          </button>
          <p className="mt-2 text-xs text-zinc-500">v0.1.0</p>
        </div>
      </aside>
    </>
  )
}
