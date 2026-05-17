import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import Sidebar from './components/layout/Sidebar.jsx'
import Header from './components/layout/Header.jsx'
import { TitleProvider } from './context/TitleContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MarketplacePage from './pages/MarketplacePage.jsx'
import AgentsPage from './pages/AgentsPage.jsx'
import WorkflowBuilderPage from './pages/WorkflowBuilderPage.jsx'
import WorkflowRunPage from './pages/WorkflowRunPage.jsx'
import HITLPage from './pages/HITLPage.jsx'
import ObservabilityPage from './pages/ObservabilityPage.jsx'

export default function App() {
  return (
    <TitleProvider>
      <div className="min-h-screen flex bg-bg bg-noise text-ink relative">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 relative">
          <Header />
          <main className="flex-1 overflow-auto bg-grid">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/marketplace" element={<MarketplacePage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/builder" element={<WorkflowBuilderPage />} />
              <Route path="/builder/:workflowId" element={<WorkflowBuilderPage />} />
              <Route path="/runs/:runId" element={<WorkflowRunPage />} />
              <Route path="/hitl" element={<HITLPage />} />
              <Route path="/observability" element={<ObservabilityPage />} />
            </Routes>
          </main>
        </div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: '#161623', border: '1px solid #1f1f33', color: '#e9e9f7' },
          }}
        />
      </div>
    </TitleProvider>
  )
}
