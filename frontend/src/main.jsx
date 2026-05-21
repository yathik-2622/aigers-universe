import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'
import './index.css'
import 'reactflow/dist/style.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <SettingsProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <App />
      </BrowserRouter>
    </SettingsProvider>
  </AuthProvider>
)
