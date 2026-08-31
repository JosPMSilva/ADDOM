function clean(value) {
  return String(value ?? '').trim()
}

function slugify(value = '') {
  const normalized = clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
  return normalized
}

export function normalizeMoaRoleKey(value = '') {
  return slugify(value).slice(0, 48)
}

export function deriveMoaRoleKey({ roleKey = '', name = '', id = '' } = {}) {
  const explicit = normalizeMoaRoleKey(roleKey)
  if (explicit) return explicit

  const fromName = normalizeMoaRoleKey(name)
  if (fromName) return fromName

  const idText = clean(id)
  if (!idText) return ''
  return normalizeMoaRoleKey(idText.replace(/^role_?/i, ''))
}

export function resolveMoaRoleKey(role = {}) {
  const source = role && typeof role === 'object' ? role : {}
  return deriveMoaRoleKey({
    roleKey: source.roleKey || source.role_key || source.key,
    name: source.name,
    id: source.id,
  })
}
