import { deriveMoaRoleKey, resolveMoaRoleKey } from '../../../common/moa/moa-role-keys.mjs'

export const EMPTY_ROLE_FORM = Object.freeze({
  name: '',
  providerId: '',
  model: '',
  systemPrompt: '',
  canWriteFiles: false,
  templateId: '',
  templateVersion: 0,
  templateLabel: '',
})

export const ROLE_FORM_MODES = Object.freeze({
  basic: 'basic',
  advanced: 'advanced',
  developer: 'developer',
})

function clean(value) {
  return String(value ?? '').trim()
}

export function getRoleTemplateInstallState(template = {}, moaRoles = []) {
  const templateId = clean(template?.id).toLowerCase()
  if (!templateId) return { state: 'available', role: null }
  const role = (Array.isArray(moaRoles) ? moaRoles : []).find((item) => (
    clean(item?.templateId).toLowerCase() === templateId
  )) || null
  if (!role) return { state: 'available', role: null }
  const installedVersion = Number(role.templateVersion || 0) || 0
  const availableVersion = Number(template.version || 1) || 1
  return {
    state: installedVersion < availableVersion ? 'update_available' : 'added',
    role,
  }
}

export function createRoleFormFromTemplate(template = {}, { existingRole = null } = {}) {
  const tpl = template && typeof template === 'object' ? template : {}
  const existing = existingRole && typeof existingRole === 'object' ? existingRole : null
  return {
    ...EMPTY_ROLE_FORM,
    name: clean(existing?.name || tpl.defaultName || tpl.label),
    providerId: clean(existing?.providerId),
    model: clean(existing?.model),
    systemPrompt: String(tpl.defaultSystemPrompt || '').slice(0, 2000),
    canWriteFiles: false,
    templateId: clean(tpl.id),
    templateVersion: Number(tpl.version || 1) || 1,
    templateLabel: clean(tpl.label),
  }
}

export function createRoleFormFromExisting(role = {}) {
  return {
    ...EMPTY_ROLE_FORM,
    name: clean(role.name),
    providerId: clean(role.providerId),
    model: clean(role.model),
    systemPrompt: String(role.systemPrompt ?? ''),
    canWriteFiles: !!role.canWriteFiles,
    templateId: clean(role.templateId),
    templateVersion: Number(role.templateVersion || 0) || 0,
    templateLabel: clean(role.templateLabel),
  }
}

export function validateRoleForm({
  form,
  moaRoles = [],
  editingId = null,
  persistedRoleKey = '',
}) {
  if (!clean(form?.name)) return 'Role name is required.'
  if (!clean(form?.providerId)) return 'Provider is required.'
  if (!clean(form?.model)) return 'Model is required.'
  const duplicate = (Array.isArray(moaRoles) ? moaRoles : []).find((role) => (
    clean(role.name).toLowerCase() === clean(form.name).toLowerCase()
    && String(role.id || '') !== String(editingId || '')
  ))
  if (duplicate) return `A role named "${clean(form.name)}" already exists.`
  const nextRoleKey = deriveMoaRoleKey({
    roleKey: persistedRoleKey,
    name: form?.name,
  })
  const duplicateRoleKey = (Array.isArray(moaRoles) ? moaRoles : []).find((role) => (
    resolveMoaRoleKey(role) === nextRoleKey
    && String(role.id || '') !== String(editingId || '')
  ))
  if (duplicateRoleKey) return `A role key for "${clean(form.name)}" already exists. Rename the role to make it unique.`
  return ''
}

export function toPersistedRole(
  form = {},
  { id = '', roleKey = '', mode = ROLE_FORM_MODES.developer } = {},
) {
  const isBasic = mode === ROLE_FORM_MODES.basic
  const persisted = {
    id: clean(id),
    roleKey: deriveMoaRoleKey({
      roleKey,
      name: form?.name,
      id,
    }),
    name: clean(form.name),
    providerId: clean(form.providerId),
    model: clean(form.model).slice(0, 120),
    canWriteFiles: isBasic ? false : !!form.canWriteFiles,
  }
  const systemPrompt = clean(form.systemPrompt)
  if (systemPrompt) persisted.systemPrompt = systemPrompt.slice(0, 2000)
  if (clean(form.templateId)) persisted.templateId = clean(form.templateId).slice(0, 80)
  if (Number(form.templateVersion) > 0) persisted.templateVersion = Number(form.templateVersion)
  if (clean(form.templateLabel)) persisted.templateLabel = clean(form.templateLabel).slice(0, 80)
  return persisted
}
