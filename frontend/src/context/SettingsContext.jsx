import React, { createContext, useContext, useEffect, useState } from 'react'
import { getSettings, updateSettings as updateSettingsApi } from '../api/settings.js'
import { useAuth } from './AuthContext.jsx'

const SettingsContext = createContext(null)

const DEFAULT_SETTINGS = {
  provider: 'gateway',
  base_url: '',
  default_model: 'gpt-4o',
  embedding_model: 'text-embedding-3-small',
  theme: 'dark',
}

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  document.documentElement.style.colorScheme = next
  try { localStorage.setItem('aigers.theme', next) } catch {}
}

export function SettingsProvider({ children }) {
  const { ready, token } = useAuth()
  const [settings, setSettings] = useState(() => {
    const cachedTheme = (() => {
      try { return localStorage.getItem('aigers.theme') || 'dark' } catch { return 'dark' }
    })()
    return { ...DEFAULT_SETTINGS, theme: cachedTheme }
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  useEffect(() => {
    if (!ready || !token) return
    let mounted = true
    setLoading(true)
    getSettings()
      .then((data) => {
        if (!mounted) return
        setSettings((prev) => ({ ...prev, ...DEFAULT_SETTINGS, ...(data.settings || {}) }))
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [ready, token])

  const updateSettings = async (payload) => {
    const data = await updateSettingsApi(payload)
    const next = { ...DEFAULT_SETTINGS, ...(data.settings || {}), theme: payload.theme || data.settings?.theme || settings.theme }
    setSettings((prev) => ({ ...prev, ...next }))
    return data
  }

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings, setTheme: (theme) => setSettings((prev) => ({ ...prev, theme })) }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used within SettingsProvider')
  return value
}
