import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { TerminalBar } from '../TerminalBar'
import { TerminalOverlay } from '../TerminalOverlay'
import { TerminalOverlayProvider } from '../../contexts/TerminalOverlayContext'
import { AppHeader } from '../molecules/AppHeader'
import { MobileMenu } from '../organisms/MobileMenu'
import { Sidebar } from '../organisms/Sidebar'

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  const toggleMenu = () => setMenuOpen((prev) => !prev)

  return (
    <TerminalOverlayProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100 md:flex-row">
        <AppHeader onMenuClick={toggleMenu} isMenuOpen={menuOpen} />
        <Sidebar />
        <MobileMenu isOpen={menuOpen} onClose={closeMenu} />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <TerminalBar />
      <TerminalOverlay />
    </TerminalOverlayProvider>
  )
}
