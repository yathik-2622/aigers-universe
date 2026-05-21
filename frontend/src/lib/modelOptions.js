export function normalizeModelOption(model) {
  if (typeof model === 'string') {
    return { value: model, label: model, meta: 'model', provider: 'unknown', free: false }
  }
  const id = model?.id || model?.value || model?.name || model?.label || 'gpt-4o'
  const provider = model?.provider || 'gateway'
  const badges = []
  if (model?.free) badges.push('free')
  badges.push(provider)
  return {
    value: id,
    label: model?.label || model?.name || id,
    meta: badges.join(' • '),
    provider,
    free: !!model?.free,
    description: model?.description || '',
    context_length: model?.context_length || null,
  }
}

export function normalizeModelOptions(models = []) {
  return models.map(normalizeModelOption)
}
