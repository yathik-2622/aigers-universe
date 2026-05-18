import axios from 'axios'

const baseURL = import.meta.env.VITE_REACT_APP_BACKEND_URL || ''

export const api = axios.create({
  baseURL: `${baseURL}/api`,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem('aigers.user')
    if (raw) {
      const user = JSON.parse(raw)
      if (user?.user_id) {
        config.headers = config.headers || {}
        config.headers['X-User-Id'] = user.user_id
      }
    }
  } catch {}
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    console.error('API error:', err?.response?.data || err.message)
    return Promise.reject(err)
  }
)
