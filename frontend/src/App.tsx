import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TeamPage } from './pages/TeamPage'
import { LeadsListPage } from './pages/LeadsListPage'
import { LeadDetailPage } from './pages/LeadDetailPage'
import { CampaignsListPage } from './pages/CampaignsListPage'
import { CampaignDetailPage } from './pages/CampaignDetailPage'
import { LiveCallsPage } from './pages/LiveCallsPage'
import { CallDetailPage } from './pages/CallDetailPage'
import { AiAgentsListPage } from './pages/AiAgentsListPage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { FollowUpsListPage } from './pages/FollowUpsListPage'
import { MeetingsCalendarPage } from './pages/MeetingsCalendarPage'
import { PipelinePage } from './pages/PipelinePage'
import { DealDetailPage } from './pages/DealDetailPage'
import { TasksPage } from './pages/TasksPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Layout>
              <DashboardPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/analytics"
        element={
          <RequireAuth>
            <Layout>
              <AnalyticsPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/leads"
        element={
          <RequireAuth>
            <Layout>
              <LeadsListPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/leads/:id"
        element={
          <RequireAuth>
            <Layout>
              <LeadDetailPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/campaigns"
        element={
          <RequireAuth>
            <Layout>
              <CampaignsListPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/campaigns/:id"
        element={
          <RequireAuth>
            <Layout>
              <CampaignDetailPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/calls"
        element={
          <RequireAuth>
            <Layout>
              <LiveCallsPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/calls/:id"
        element={
          <RequireAuth>
            <Layout>
              <CallDetailPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/ai-agents"
        element={
          <RequireAuth>
            <Layout>
              <AiAgentsListPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/knowledge-base"
        element={
          <RequireAuth>
            <Layout>
              <KnowledgeBasePage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/follow-ups"
        element={
          <RequireAuth>
            <Layout>
              <FollowUpsListPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/meetings"
        element={
          <RequireAuth>
            <Layout>
              <MeetingsCalendarPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/pipeline"
        element={
          <RequireAuth>
            <Layout>
              <PipelinePage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/deals/:id"
        element={
          <RequireAuth>
            <Layout>
              <DealDetailPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/tasks"
        element={
          <RequireAuth>
            <Layout>
              <TasksPage />
            </Layout>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <RequireRole roles={['ADMIN']}>
              <Layout>
                <SettingsPage />
              </Layout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/team"
        element={
          <RequireAuth>
            <RequireRole roles={['ADMIN', 'SALES_MANAGER']}>
              <Layout>
                <TeamPage />
              </Layout>
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
