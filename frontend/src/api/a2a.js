import { api } from './client'

export const listAgentCards = () => api.get('/a2a/agents/cards').then(r => r.data)
export const getAgentCard = (agentId) => api.get(`/a2a/agents/${agentId}/card`).then(r => r.data)
export const validateRemoteCard = (agent_card_url) => api.post('/a2a/validate-card', { agent_card_url }).then(r => r.data)
