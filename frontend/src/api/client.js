import axios from 'axios'

const baseURL = import.meta.env.VITE_REACT_APP_BACKEND_URL || ''

export const api = axios.create({
  baseURL: `${baseURL}/api`,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    console.error('API error:', err?.response?.data || err.message)
    return Promise.reject(err)
  }
)
