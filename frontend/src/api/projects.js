import { api } from './client.js'

export const listProjects = () => api.get('/projects').then(r => r.data)
export const createProject = (body) => api.post('/projects', body).then(r => r.data)
export const getProject = (id) => api.get(`/projects/${id}`).then(r => r.data)
export const updateProject = (id, body) => api.put(`/projects/${id}`, body).then(r => r.data)
export const deleteProject = (id) => api.delete(`/projects/${id}`).then(r => r.data)
