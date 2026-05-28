import { api } from './client'

export const listWorkflows = () => api.get('/workflows').then(r => r.data)
export const getWorkflow = (id) => api.get(`/workflows/${id}`).then(r => r.data)
export const createWorkflow = (body) => api.post('/workflows', body).then(r => r.data)
export const updateWorkflow = (id, body) => api.put(`/workflows/${id}`, body).then(r => r.data)
export const autoBuildWorkflow = (body) => api.post('/workflows/auto-build', body).then(r => r.data)
export async function streamAutoBuildWorkflow(body, handlers = {}) {
  const baseURL = import.meta.env.VITE_REACT_APP_BACKEND_URL || ''
  let token = ''
  try {
    const raw = localStorage.getItem('aigers.auth')
    if (raw) token = JSON.parse(raw)?.access_token || ''
  } catch {}
  const response = await fetch(`${baseURL}/api/workflows/auto-build/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(text || 'Workflow planner stream failed')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const emit = (eventName, payload) => {
    if (eventName === 'status_update') handlers.onStatus?.(payload)
    if (eventName === 'requires_input') handlers.onRequiresInput?.(payload)
    if (eventName === 'final_plan') handlers.onFinalPlan?.(payload)
    if (eventName === 'error') handlers.onError?.(payload)
    if (eventName === 'end') handlers.onEnd?.(payload)
  }
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const lines = chunk.split('\n').filter(Boolean)
      const eventLine = lines.find((line) => line.startsWith('event: '))
      const dataLines = lines.filter((line) => line.startsWith('data: '))
      if (!eventLine || !dataLines.length) continue
      const eventName = eventLine.replace('event: ', '').trim()
      const rawData = dataLines.map((line) => line.replace('data: ', '')).join('\n')
      try {
        emit(eventName, JSON.parse(rawData))
      } catch {
        emit(eventName, { type: eventName, detail: rawData })
      }
    }
  }
}
export const runWorkflow = (id, body) => api.post(`/workflows/${id}/run`, body).then(r => r.data)
export const getRun = (runId) => api.get(`/workflows/runs/${runId}`).then(r => r.data)
export const getRunReport = (runId) => api.get(`/workflows/runs/${runId}/report-materialized`).then(r => r.data)
export const pauseRun = (runId) => api.post(`/workflows/runs/${runId}/pause`).then(r => r.data)
export const resumeRun = (runId) => api.post(`/workflows/runs/${runId}/resume`).then(r => r.data)
export const stopRun = (runId) => api.post(`/workflows/runs/${runId}/stop`).then(r => r.data)
export const listAllRuns = () => api.get('/workflows/runs/all').then(r => r.data)
export const deleteRun = (runId) => api.delete(`/workflows/runs/${runId}`).then(r => r.data)
