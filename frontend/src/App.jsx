import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import Header from './components/layout/Header.jsx'
import Sidebar from './components/layout/Sidebar.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { TitleProvider } from './context/TitleContext.jsx'
import AgentsPage from './pages/AgentsPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import HITLPage from './pages/HITLPage.jsx'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MarketplacePage from './pages/MarketplacePage.jsx'
import ObservabilityPage from './pages/ObservabilityPage.jsx'
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
              <Route path="/marketplace" element={<MarketplacePage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/builder" element={<WorkflowBuilderPage />} />
              <Route path="/builder/:workflowId" element={<WorkflowBuilderPage />} />
              <Route path="/runs/:runId" element={<WorkflowRunPage />} />
              <Route path="/hitl" element={<HITLPage />} />
              <Route path="/observability" element={<ObservabilityPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </TitleProvider>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: { background: '#161623', border: '1px solid #1f1f33', color: '#e9e9f7' },
        }}
      />
    </>
  )
}
