import { api } from './client.js'

export const login = (body) => api.post('/auth/login', body).then(r => r.data)
export const getMe = () => api.get('/auth/me').then(r => r.data)
