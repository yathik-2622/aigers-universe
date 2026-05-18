import { api } from './client'

export const uploadDocument = (file, category = 'general') => {
  const form = new FormData()
  form.append('file', file)
  form.append('category', category)
  return api.post('/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const listDocuments = () => api.get('/documents').then(r => r.data)
export const getDocument = (id) => api.get(`/documents/${id}`).then(r => r.data)

export const importGithubRepo = (repoUrl, category = 'repo-context') => {
  const form = new FormData()
  form.append('repo_url', repoUrl)
  form.append('category', category)
  return api.post('/documents/import-github', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const uploadWorkflowInput = (file, category = 'workflow-input') => {
  const form = new FormData()
  form.append('file', file)
  form.append('category', category)
  return api.post('/documents/workflow-input/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const importWorkflowGithubRepo = (repoUrl, category = 'workflow-input') => {
  const form = new FormData()
  form.append('repo_url', repoUrl)
  form.append('category', category)
  return api.post('/documents/workflow-input/import-github', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
