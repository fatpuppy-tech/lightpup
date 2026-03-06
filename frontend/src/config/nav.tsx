import type { ReactNode } from 'react'
import {
  DashboardIcon,
  ProjectsIcon,
  ServersIcon,
  SettingsIcon,
} from '../components/atoms/NavIcons'

export type NavEntry = {
  to: string
  end?: boolean
  label: string
  icon: ReactNode
}

export const navEntries: NavEntry[] = [
  { to: '/', end: true, label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/projects', label: 'Projects', icon: <ProjectsIcon /> },
  { to: '/servers', label: 'Servers', icon: <ServersIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
]
