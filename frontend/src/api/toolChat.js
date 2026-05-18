import { api } from './client.js'

export const sendToolChat = (body) => api.post('/tool-chat/message', body).then(r => r.data)
