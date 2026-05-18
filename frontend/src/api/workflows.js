import { api } from './client'

export const listWorkflows = () => api.get('/workflows').then(r => r.data)
export const getWorkflow = (id) => api.get(`/workflows/${id}`).then(r => r.data)
export const createWorkflow = (body) => api.post('/workflows', body).then(r => r.data)
export const runWorkflow = (id, body) => api.post(`/workflows/${id}/run`, body).then(r => r.data)
export const getRun = (runId) => api.get(`/workflows/runs/${runId}`).then(r => r.data)
export const getRunReport = (runId) => api.get(`/workflows/runs/${runId}/report`).then(r => r.data)
export const resumeRun = (runId) => api.post(`/workflows/runs/${runId}/resume`).then(r => r.data)
export const listAllRuns = () => api.get('/workflows/runs/all').then(r => r.data)
