import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import Header from './components/layout/Header.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { useSettings } from './context/SettingsContext.jsx'
import { TitleProvider } from './context/TitleContext.jsx'
import AgentsPage from './pages/AgentsPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import HITLPage from './pages/HITLPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MarketplacePage from './pages/MarketplacePage.jsx'
import ObservabilityPage from './pages/ObservabilityPage.jsx'
import ProjectsPage from './pages/ProjectsPage.jsx'
import ToolPlaygroundPage from './pages/ToolPlaygroundPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import WorkflowBuilderPage from './pages/WorkflowBuilderPage.jsx'
import WorkflowRunPage from './pages/WorkflowRunPage.jsx'

function ProtectedShell() {
  const { ready, user } = useAuth()
  if (!ready) return <div className="min-h-screen bg-bg bg-noise" />
  if (!user?.user_id) return <Navigate to="/login" replace />

  return (
    <TitleProvider>
      <div className="h-screen overflow-hidden flex bg-bg bg-noise text-ink relative">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          <Header />
          <main className="flex-1 min-h-0 overflow-y-auto bg-grid">
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/marketplace" element={<MarketplacePage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/builder" element={<WorkflowBuilderPage />} />
              <Route path="/builder/:workflowId" element={<WorkflowBuilderPage />} />
              <Route path="/tools-chat" element={<ToolPlaygroundPage />} />
              <Route path="/runs/:runId" element={<WorkflowRunPage />} />
              <Route path="/hitl" element={<HITLPage />} />
              <Route path="/observability" element={<ObservabilityPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </TitleProvider>
  )
}

export default function App() {
  const { settings } = useSettings()
  const dark = (settings?.theme || 'dark') !== 'light'
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
      <Toaster
        theme={dark ? 'dark' : 'light'}
        position="bottom-right"
        toastOptions={{
          style: {
            background: dark ? 'linear-gradient(180deg, rgba(15,19,36,0.96), rgba(10,12,24,0.96))' : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(242,246,252,0.96))',
            border: dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(15,23,42,0.08)',
            color: dark ? '#e9e9f7' : '#0f172a',
            borderRadius: '18px',
            backdropFilter: 'blur(12px)',
            boxShadow: dark ? '0 18px 60px rgba(0,0,0,0.28)' : '0 18px 60px rgba(15,23,42,0.12)',
          },
        }}
      />
    </>
  )
}
