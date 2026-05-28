import { api } from './client.js'

export const listChatSessions = () => api.get('/tool-chat/sessions').then((r) => r.data)
export const createChatSession = (body) => api.post('/tool-chat/sessions', body).then((r) => r.data)
export const getChatSession = (id) => api.get(`/tool-chat/sessions/${id}`).then((r) => r.data)
export const updateChatSession = (id, body) => api.put(`/tool-chat/sessions/${id}`, body).then((r) => r.data)
export const deleteChatSession = (id) => api.delete(`/tool-chat/sessions/${id}`).then((r) => r.data)
export const sendChatMessage = (id, body) => api.post(`/tool-chat/sessions/${id}/message`, body).then((r) => r.data)

export const uploadChatFiles = (id, files, category = 'chat-input') => {
  const form = new FormData()
  Array.from(files || []).forEach((file) => form.append('files', file))
  form.append('category', category)
  return api.post(`/tool-chat/sessions/${id}/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const fetchCitationSource = (contentUrl) => {
  const target = (contentUrl || '').replace(/^\/api/, '') || ''
  if (!target) return Promise.resolve(null)
  return api.get(target).then((r) => r.data)
}

export async function streamChatMessage(id, body, handlers = {}) {
  const baseURL = import.meta.env.VITE_REACT_APP_BACKEND_URL || ''
  let token = ''
  try {
    const raw = localStorage.getItem('aigers.auth')
    if (raw) token = JSON.parse(raw)?.access_token || ''
  } catch {}

  const response = await fetch(`${baseURL}/api/tool-chat/sessions/${id}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok || !response.body) {
    if (response.status === 401) {
      try { localStorage.removeItem('aigers.auth') } catch {}
      if (window.location.pathname !== '/login') window.location.assign('/login')
    }
    const text = await response.text()
    throw new Error(text || 'Stream request failed')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const emit = (eventName, payload) => {
    if (eventName === 'assistant_start') handlers.onAssistantStart?.(payload)
    if (eventName === 'log') handlers.onLog?.(payload)
    if (eventName === 'tool') handlers.onTool?.(payload)
    if (eventName === 'content_delta') handlers.onContentDelta?.(payload)
    if (eventName === 'final') handlers.onFinal?.(payload)
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
