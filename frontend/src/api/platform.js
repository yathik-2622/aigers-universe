import { api } from './client'

export const listAgents = () => api.get('/platform/agents').then(r => r.data)
export const getAgent = (id) => api.get(`/platform/agents/${id}`).then(r => r.data)
export const registerAgent = (body) => api.post('/platform/agents', body).then(r => r.data)
export const updateAgent = (id, body) => api.put(`/platform/agents/${id}`, body).then(r => r.data)
export const deleteAgent = (id) => api.delete(`/platform/agents/${id}`).then(r => r.data)
export const invokeAgent = (id, body) => api.post(`/platform/agents/${id}/invoke`, body).then(r => r.data)
export const listTools = () => api.get('/platform/tools').then(r => r.data)

export const listTemplates = (search) => api.get('/marketplace/templates', { params: { search } }).then(r => r.data)
export const installTemplate = (id, body = {}) => api.post(`/marketplace/templates/${id}/install`, body).then(r => r.data)
