import { api } from './client'

export const listDocuments = (params = {}) => api.get('/documents', { params }).then((r) => r.data)

export const getDocument = (documentId) => api.get(`/documents/${documentId}`).then((r) => r.data)

export const listDocumentCategories = () => api.get('/documents/categories').then((r) => r.data)

export const createDocumentCategory = (payload) => api.post('/documents/categories', payload).then((r) => r.data)

export const listChunkingStrategies = () => api.get('/documents/chunking-strategies').then((r) => r.data)

export const uploadDocumentsMany = (files, options = {}) => {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  form.append('category', options.category || 'general')
  form.append('sub_category', options.sub_category || '')
  form.append('visibility', options.visibility || 'private')
  form.append('chunk_strategy', options.chunk_strategy || 'section-aware-large')
  return api.post('/documents/upload-many', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const uploadDocument = (file, category = 'general', options = {}) => {
  const form = new FormData()
  form.append('file', file)
  form.append('category', category || options.category || 'general')
  form.append('sub_category', options.sub_category || '')
  form.append('visibility', options.visibility || 'private')
  form.append('chunk_strategy', options.chunk_strategy || 'section-aware-large')
  return api.post('/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const ingestDocuments = (documentIds) => api.post('/documents/ingest', {
  document_ids: documentIds,
}).then((r) => r.data)

export const ingestDocument = (documentId) => api.post(`/documents/${documentId}/ingest`).then((r) => r.data)

export const deleteDocument = (documentId) => api.delete(`/documents/${documentId}`).then((r) => r.data)

export const importGithubRepo = (repoUrl, category = 'repo-context', options = {}) => {
  const form = new FormData()
  form.append('repo_url', repoUrl)
  form.append('category', category || options.category || 'repo-context')
  form.append('sub_category', options.sub_category || '')
  form.append('visibility', options.visibility || 'private')
  form.append('chunk_strategy', options.chunk_strategy || 'section-aware-large')
  return api.post('/documents/import-github', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const uploadWorkflowInput = (file, category = 'workflow-input') => {
  const form = new FormData()
  form.append('file', file)
  form.append('category', category)
  return api.post('/documents/workflow-input/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const importWorkflowGithubRepo = (repoUrl, category = 'workflow-input') => {
  const form = new FormData()
  form.append('repo_url', repoUrl)
  form.append('category', category)
  return api.post('/documents/workflow-input/import-github', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}
