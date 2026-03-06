import { MenuButton } from '../atoms/MenuButton'

export type AppHeaderProps = {
  onMenuClick: () => void
  isMenuOpen: boolean
}

export function AppHeader({ onMenuClick, isMenuOpen }: AppHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3 md:hidden">
      <h1 className="text-lg font-semibold tracking-tight">
        Light<span className="text-emerald-400">Pup</span>
      </h1>
      <MenuButton
        aria-expanded={isMenuOpen}
        onClick={onMenuClick}
        aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
      />
    </header>
  )
}
