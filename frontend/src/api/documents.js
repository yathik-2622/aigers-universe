import { api } from './client'

export const uploadDocument = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const listDocuments = () => api.get('/documents').then(r => r.data)
export const getDocument = (id) => api.get(`/documents/${id}`).then(r => r.data)
