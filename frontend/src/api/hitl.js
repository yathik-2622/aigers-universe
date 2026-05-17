import { api } from './client'

export const getPending = () => api.get('/hitl/pending').then(r => r.data)
export const getAllHitl = () => api.get('/hitl/all').then(r => r.data)
export const approveHitl = (id, note) => api.post(`/hitl/${id}/approve`, { note }).then(r => r.data)
export const rejectHitl = (id, reason) => api.post(`/hitl/${id}/reject`, { reason }).then(r => r.data)
