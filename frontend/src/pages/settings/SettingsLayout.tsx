import { Outlet } from 'react-router-dom'
import { PageHeader } from '../../components/molecules/PageHeader'
import { PageMain } from '../../components/layout/PageMain'
import { Tabs } from '../../components/molecules/Tabs'

const tabs = [
  { to: '/settings/general', label: 'General' },
  { to: '/settings/integrations', label: 'Integrations' },
  { to: '/settings/profile', label: 'Profile' },
] as const

export function SettingsLayout() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
      <PageHeader
        title="Settings"
        description="Instance configuration, integrations, and your account."
      />
      <div className="px-4 sm:px-6 lg:px-8">
        <Tabs variant="links" tabs={[...tabs]} aria-label="Settings tabs" />
      </div>
      <PageMain className="max-w-6xl flex-1">
        <Outlet />
      </PageMain>
    </div>
  )
}
