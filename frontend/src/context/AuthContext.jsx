import React, { createContext, useContext, useEffect, useState } from 'react'
import { getMe, login as loginApi } from '../api/auth.js'

const STORAGE_KEY = 'aigers.user'
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const hydrate = async () => {
      if (!user?.user_id) {
        if (mounted) setReady(true)
        return
      }
      try {
        const fresh = await getMe()
        if (mounted) setUser(fresh)
      } catch {
        try { localStorage.removeItem(STORAGE_KEY) } catch {}
        if (mounted) setUser(null)
      } finally {
        if (mounted) setReady(true)
      }
    }
    hydrate()
    return () => { mounted = false }
  }, [user?.user_id])

  const login = async (payload) => {
    const fresh = await loginApi(payload)
    setUser(fresh)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)) } catch {}
    return fresh
  }

  const logout = () => {
    setUser(null)
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
