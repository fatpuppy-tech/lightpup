import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { navEntries } from '../../config/nav'
import { NavItem } from '../molecules/NavItem'
import Logo from '../../assets/logo.png'

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="hidden h-screen w-60 flex-shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-zinc-900 px-4 py-6 md:flex">
      <div className="mb-6 shrink-0 border-b border-zinc-800 pb-4 flex items-center gap-2">
      <img src={Logo} alt="LightPup" className="h-8 w-8" /> 
        <h1 className="text-lg font-semibold tracking-tight">Light<span className="text-emerald-400">Pup</span>
        </h1>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {navEntries.map(({ to, end, label, icon }) => (
          <NavItem key={to} to={to} end={end} icon={icon}>
            {label}
          </NavItem>
        ))}
      </nav>
      <div className="mt-4 shrink-0 border-t border-zinc-800 pt-3">
        {user && (
          <p className="mb-2 truncate text-xs text-zinc-500">{user.username}</p>
        )}
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
  )
}
