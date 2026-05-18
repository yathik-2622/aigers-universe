const KEY = 'aigers.currentProjectId'

export function getCurrentProjectId() {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}

export function setCurrentProjectId(projectId) {
  try {
    if (projectId) localStorage.setItem(KEY, projectId)
    else localStorage.removeItem(KEY)
  } catch {}
}
