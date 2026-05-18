import React, { createContext, useContext, useEffect, useState } from 'react'
import { getMe, login as loginApi, logout as logoutApi } from '../api/auth.js'

const STORAGE_KEY = 'aigers.auth'
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const hydrate = async () => {
      if (!auth?.access_token) {
        if (mounted) setReady(true)
        return
      }
      try {
        const freshUser = await getMe()
        if (mounted) {
          const next = { ...auth, user: freshUser }
          setAuth(next)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        }
      } catch {
        try { localStorage.removeItem(STORAGE_KEY) } catch {}
        if (mounted) setAuth(null)
      } finally {
        if (mounted) setReady(true)
      }
    }
    hydrate()
    return () => { mounted = false }
  }, [auth?.access_token])

  const login = async (payload) => {
    const fresh = await loginApi(payload)
    setAuth(fresh)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch {}
    return fresh
  }

  const logout = async () => {
    try { await logoutApi() } catch {}
    setAuth(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  return <AuthContext.Provider value={{ user: auth?.user || null, token: auth?.access_token || null, ready, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
