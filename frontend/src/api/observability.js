import { api } from './client'

export const getMetrics = () => api.get('/observability/metrics').then(r => r.data)
export const getTraces = (workflow_run_id) => api.get('/observability/traces', { params: { workflow_run_id } }).then(r => r.data)
export const getFullTrace = (runId) => api.get(`/observability/traces/${runId}/full`).then(r => r.data)
