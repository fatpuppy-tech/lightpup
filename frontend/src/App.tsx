import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedLayout } from './components/layout/ProtectedLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { NewProjectPage } from './pages/NewProjectPage'
import { ProjectPage } from './pages/ProjectPage'
import { NewEnvironmentPage } from './pages/NewEnvironmentPage'
import { EnvironmentPage } from './pages/EnvironmentPage'
import { ApplicationDetailPage } from './pages/ApplicationDetailPage'
import { ServerDetailPage } from './pages/ServerDetailPage'
import { NewApplicationPage } from './pages/NewApplicationPage'
import { EditApplicationPage } from './pages/EditApplicationPage'
import { DeploymentsPage } from './pages/DeploymentsPage'
import { DeploymentDetailPage } from './pages/DeploymentDetailPage'
import { SettingsLayout } from './pages/settings/SettingsLayout'
import { SettingsGeneralTab } from './pages/settings/SettingsGeneralTab'
import { SettingsIntegrationsTab } from './pages/settings/SettingsIntegrationsTab'
import { SettingsSSLTab } from './pages/settings/SettingsSSLTab'
import { SettingsProfileTab } from './pages/settings/SettingsProfileTab'
import { SettingsUsersTab } from './pages/settings/SettingsUsersTab'
import { SettingsUserEditPage } from './pages/settings/SettingsUserEditPage'
import { ProjectSettingsLayout } from './pages/project-settings/ProjectSettingsLayout'
import { ProjectSettingsMembersTab } from './pages/project-settings/ProjectSettingsMembersTab'
import { ProjectSettingsEnvTab } from './pages/project-settings/ProjectSettingsEnvTab'
import { ServersPage } from './pages/ServersPage'
import { NewServerPage } from './pages/NewServerPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { InvitePage } from './pages/InvitePage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite" element={<InvitePage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<NewProjectPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="/projects/:projectId/settings" element={<ProjectSettingsLayout />}>
          <Route index element={<Navigate to="members" replace />} />
          <Route path="members" element={<ProjectSettingsMembersTab />} />
          <Route path="env" element={<ProjectSettingsEnvTab />} />
        </Route>
        <Route
          path="/projects/:projectId/environments/new"
          element={<NewEnvironmentPage />}
        />
        <Route path="/environments/:envId" element={<EnvironmentPage />} />
        <Route path="/applications/:appId" element={<ApplicationDetailPage />} />
        <Route
          path="/environments/:envId/applications/new"
          element={<NewApplicationPage />}
        />
        <Route
          path="/environments/:envId/applications/:appId/edit"
          element={<EditApplicationPage />}
        />
        <Route
          path="/applications/:appId/deployments"
          element={<DeploymentsPage />}
        />
        <Route
          path="/deployments/:deploymentId"
          element={<DeploymentDetailPage />}
        />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<Navigate to="general" replace />} />
          <Route path="general" element={<SettingsGeneralTab />} />
          <Route path="integrations" element={<SettingsIntegrationsTab />} />
          <Route path="ssl" element={<SettingsSSLTab />} />
          <Route path="profile" element={<SettingsProfileTab />} />
          <Route path="users" element={<SettingsUsersTab />} />
          <Route path="users/:userId" element={<SettingsUserEditPage />} />
        </Route>
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/servers/new" element={<NewServerPage />} />
          <Route path="/servers/:serverId" element={<ServerDetailPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
