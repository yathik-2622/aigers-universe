import { api } from './client.js'

export const getAdminOverview = () => api.get('/admin/overview').then(r => r.data)
