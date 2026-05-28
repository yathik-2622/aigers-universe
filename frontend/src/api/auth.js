import { api } from './client.js'

export const login = (body) => api.post('/auth/login', body).then(r => r.data)
export const signup = (body) => api.post('/auth/signup', body).then(r => r.data)
export const getMe = () => api.get('/auth/me').then(r => r.data)
export const logout = () => api.post('/auth/logout').then(r => r.data)
