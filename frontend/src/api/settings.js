import { api } from './client'

export const getSettings = () => api.get('/settings').then((r) => r.data)
export const updateSettings = (body) => api.put('/settings', body).then((r) => r.data)
export const discoverSettingsModels = () => api.get('/settings/models').then((r) => r.data)
