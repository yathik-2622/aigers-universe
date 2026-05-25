import axios from 'axios'

const baseURL = import.meta.env.VITE_REACT_APP_BACKEND_URL || ''
const AUTH_STORAGE_KEY = 'aigers.auth'

function clearExpiredAuth() {
  try { localStorage.removeItem(AUTH_STORAGE_KEY) } catch {}
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export const api = axios.create({
  baseURL: `${baseURL}/api`,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('aigers.auth')
    if (raw) {
      const auth = JSON.parse(raw)
      if (auth?.access_token) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${auth.access_token}`
      }
    }
  } catch {}
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    console.error('API error:', err?.response?.data || err.message)
    if (err?.response?.status === 401) {
      clearExpiredAuth()
    }
    return Promise.reject(err)
  }
)
