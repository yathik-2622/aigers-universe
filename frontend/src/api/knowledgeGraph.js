import { api } from './client'

export const getKnowledgeGraphData = (params = {}) => api.get('/knowledge-graph/data', { params }).then((r) => r.data)
export const saveKnowledgeGraphLayout = (positions, graph_id = 'default') =>
  api.post('/knowledge-graph/layout', { graph_id, positions }).then((r) => r.data)
