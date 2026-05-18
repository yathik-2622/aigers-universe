import { api } from './client.js'

export const listPolicies = () => api.get('/policies').then(r => r.data)
export const createPolicy = (body) => api.post('/policies', body).then(r => r.data)
