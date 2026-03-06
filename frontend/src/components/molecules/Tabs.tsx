import { NavLink } from 'react-router-dom'

export type TabItem =
  | { key: string; label: string }
  | { to: string; label: string }

type TabsBaseProps = {
  tabs: TabItem[]
  /** Optional aria-label for the tablist */
  'aria-label'?: string
}

type TabsWithLinks = TabsBaseProps & {
  variant: 'links'
}

type TabsWithButtons = TabsBaseProps & {
  variant: 'buttons'
  activeKey: string
  onTabChange: (key: string) => void
}

export type TabsProps = TabsWithLinks | TabsWithButtons

const tabKey = (tab: TabItem): string => 'key' in tab ? tab.key : tab.to
const tabLabel = (tab: TabItem): string => tab.label

function isLinksProps(props: TabsProps): props is TabsWithLinks {
  return props.variant === 'links'
}

export function Tabs(props: TabsProps) {
  const { tabs, 'aria-label': ariaLabel } = props
  const containerClassName = 'mb-2 flex gap-2 border-b border-zinc-800 text-sm'

  if (isLinksProps(props)) {
    return (
      <nav className={containerClassName} aria-label={ariaLabel ?? 'Tabs'}>
        {tabs.map((tab) => {
          const to = 'to' in tab ? tab.to : ''
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `-mb-px cursor-pointer border-b px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-100'
                }`
              }
            >
              {tabLabel(tab)}
            </NavLink>
          )
        })}
      </nav>
    )
  }

  const { activeKey, onTabChange } = props
  return (
    <div role="tablist" className={containerClassName} aria-label={ariaLabel ?? 'Tabs'}>
      {tabs.map((tab) => {
        const key = tabKey(tab)
        const isActive = activeKey === key
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(key)}
            className={`-mb-px cursor-pointer border-b px-3 py-2 text-xs font-medium transition-colors ${
              isActive
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {tabLabel(tab)}
          </button>
        )
      })}
    </div>
  )
}
