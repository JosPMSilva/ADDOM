import coreEn from './locales/en/core.json' with { type: 'json' }
import settingsEn from './locales/en/settings.json' with { type: 'json' }
import coreEs from './locales/es/core.json' with { type: 'json' }
import settingsEs from './locales/es/settings.json' with { type: 'json' }
import corePtBr from './locales/pt-BR/core.json' with { type: 'json' }
import settingsPtBr from './locales/pt-BR/settings.json' with { type: 'json' }
import coreFr from './locales/fr/core.json' with { type: 'json' }
import settingsFr from './locales/fr/settings.json' with { type: 'json' }
import coreDe from './locales/de/core.json' with { type: 'json' }
import settingsDe from './locales/de/settings.json' with { type: 'json' }
import coreJa from './locales/ja/core.json' with { type: 'json' }
import settingsJa from './locales/ja/settings.json' with { type: 'json' }
import coreZhCn from './locales/zh-CN/core.json' with { type: 'json' }
import settingsZhCn from './locales/zh-CN/settings.json' with { type: 'json' }
import coreKo from './locales/ko/core.json' with { type: 'json' }
import settingsKo from './locales/ko/settings.json' with { type: 'json' }
import coreIt from './locales/it/core.json' with { type: 'json' }
import settingsIt from './locales/it/settings.json' with { type: 'json' }
import coreNl from './locales/nl/core.json' with { type: 'json' }
import settingsNl from './locales/nl/settings.json' with { type: 'json' }
import corePl from './locales/pl/core.json' with { type: 'json' }
import settingsPl from './locales/pl/settings.json' with { type: 'json' }
import coreTr from './locales/tr/core.json' with { type: 'json' }
import settingsTr from './locales/tr/settings.json' with { type: 'json' }
import coreUk from './locales/uk/core.json' with { type: 'json' }
import settingsUk from './locales/uk/settings.json' with { type: 'json' }
import coreId from './locales/id/core.json' with { type: 'json' }
import settingsId from './locales/id/settings.json' with { type: 'json' }
import coreVi from './locales/vi/core.json' with { type: 'json' }
import settingsVi from './locales/vi/settings.json' with { type: 'json' }
import coreEnXa from './locales/en-XA/core.json' with { type: 'json' }
import settingsEnXa from './locales/en-XA/settings.json' with { type: 'json' }

export const DEFAULT_RENDERER_I18N_NAMESPACE = 'core'

export const RENDERER_I18N_NAMESPACES = Object.freeze([
  DEFAULT_RENDERER_I18N_NAMESPACE,
  'settings',
])

export const EN_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreEn),
  settings: Object.freeze(settingsEn),
})

export const ES_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreEs),
  settings: Object.freeze(settingsEs),
})

export const PT_BR_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(corePtBr),
  settings: Object.freeze(settingsPtBr),
})

export const FR_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreFr),
  settings: Object.freeze(settingsFr),
})

export const DE_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreDe),
  settings: Object.freeze(settingsDe),
})

export const JA_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreJa),
  settings: Object.freeze(settingsJa),
})

export const ZH_CN_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreZhCn),
  settings: Object.freeze(settingsZhCn),
})

export const KO_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreKo),
  settings: Object.freeze(settingsKo),
})

export const IT_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreIt),
  settings: Object.freeze(settingsIt),
})

export const NL_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreNl),
  settings: Object.freeze(settingsNl),
})

export const PL_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(corePl),
  settings: Object.freeze(settingsPl),
})

export const TR_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreTr),
  settings: Object.freeze(settingsTr),
})

export const UK_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreUk),
  settings: Object.freeze(settingsUk),
})

export const ID_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreId),
  settings: Object.freeze(settingsId),
})

export const VI_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreVi),
  settings: Object.freeze(settingsVi),
})

export const EN_XA_RENDERER_I18N_RESOURCES = Object.freeze({
  core: Object.freeze(coreEnXa),
  settings: Object.freeze(settingsEnXa),
})

export const RENDERER_I18N_RESOURCES = Object.freeze({
  en: EN_RENDERER_I18N_RESOURCES,
  es: ES_RENDERER_I18N_RESOURCES,
  'pt-BR': PT_BR_RENDERER_I18N_RESOURCES,
  fr: FR_RENDERER_I18N_RESOURCES,
  de: DE_RENDERER_I18N_RESOURCES,
  ja: JA_RENDERER_I18N_RESOURCES,
  'zh-CN': ZH_CN_RENDERER_I18N_RESOURCES,
  ko: KO_RENDERER_I18N_RESOURCES,
  it: IT_RENDERER_I18N_RESOURCES,
  nl: NL_RENDERER_I18N_RESOURCES,
  pl: PL_RENDERER_I18N_RESOURCES,
  tr: TR_RENDERER_I18N_RESOURCES,
  uk: UK_RENDERER_I18N_RESOURCES,
  id: ID_RENDERER_I18N_RESOURCES,
  vi: VI_RENDERER_I18N_RESOURCES,
  'en-XA': EN_XA_RENDERER_I18N_RESOURCES,
})

const RENDERER_CANONICAL_ENGLISH_TERMS = Object.freeze({
  addom_moa: 'ADDOM MoA',
  ai_generated_agent_role: 'AI-Generated Agent Role',
  artifacts: 'Artifacts',
  ask: 'Ask',
  auto: 'Auto',
  auto_compact_limit: 'Auto-compact limit',
  auto_compact_trigger: 'Auto-compact trigger',
  autonomy: 'Autonomy',
  backend: 'Backend',
  background_jobs: 'Background Jobs',
  command_palette: 'Command Palette',
  compact: '/compact',
  compact_prompt: 'Compact prompt',
  compact_threshold: '/compact-threshold',
  continuity_engine: 'Continuity Engine',
  context_management_edits: 'context_management.edits',
  continue_planning: 'Continue Planning',
  cwd: 'cwd',
  createrole: '/createrole',
  delete_file: 'delete_file',
  delegate_to_agents: 'delegate_to_agents',
  delegate_wildcard: 'delegate_*',
  docker: 'Docker',
  edit_file: 'edit_file',
  execute: 'Execute',
  frontend: 'Frontend',
  full_access: 'Full access',
  info: 'Info',
  implement_plan: 'Implement Plan',
  job_id: 'job_id',
  manual: 'Manual',
  moa: 'MoA',
  native_collaboration_mode: 'Native collaboration mode',
  openai_native: 'OpenAI native',
  permission: 'Permission',
  permission_mode: 'Permission mode',
  plan: 'Plan',
  question_user: 'question_user',
  quick_actions: 'Quick Actions',
  rate_limits: 'Rate Limits',
  reasoning_effort: 'Reasoning effort',
  role: 'Role',
  role_name: 'Role Name',
  response_id: 'response_id',
  runbook: 'Runbook',
  sandbox: 'Sandbox',
  save_role: 'Save Role',
  save_role_continue: 'Save Role & Continue',
  slash_agent: '/agent',
  slash_agents: '/agents',
  thread: 'Thread',
  thread_history: 'Thread History',
  thread_only: 'Thread Only',
  thread_project: 'Thread + Project',
  thinking: 'Thinking',
  transport_mode: 'transportMode',
  use_for_delegation: 'Use for this delegation',
  workspace: 'Workspace',
  wsl: 'WSL',
  write_file: 'write_file',
})

function applyCanonicalEnglishMarkers(template) {
  if (typeof template !== 'string' || !template.includes('[[canon:')) return template
  return template.replace(/\[\[canon:([a-z0-9_]+)\]\]/gi, (_match, rawKey) => {
    const key = String(rawKey || '').trim().toLowerCase()
    return RENDERER_CANONICAL_ENGLISH_TERMS[key] || ''
  })
}

function readNestedValue(source, keyPath = '') {
  const segments = String(keyPath || '')
    .split('.')
    .map((segment) => String(segment || '').trim())
    .filter(Boolean)
  if (!segments.length) return undefined

  let current = source
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

export function interpolateText(template, values = {}) {
  if (typeof template !== 'string') return template
  const interpolated = template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = String(rawKey || '').trim()
    const value = values?.[key]
    if (value === null || value === undefined) return ''
    return String(value)
  })
  return applyCanonicalEnglishMarkers(interpolated)
}

function resolveRendererResourceCandidates(locale = 'en') {
  const normalizedLocale = String(locale || '').trim()
  const candidates = []

  if (normalizedLocale) {
    candidates.push(normalizedLocale)
    const baseLocale = normalizedLocale.split('-')[0]
    if (baseLocale && baseLocale !== normalizedLocale) {
      candidates.push(baseLocale)
    }
  }

  candidates.push('en')

  return Array.from(new Set(candidates)).filter((candidate) => (
    candidate && Object.prototype.hasOwnProperty.call(RENDERER_I18N_RESOURCES, candidate)
  ))
}

function resolveNamespacedKey(rawKey = '', fallbackNamespaces = []) {
  const key = String(rawKey || '').trim()
  if (!key) return { namespaces: [...fallbackNamespaces], path: '' }

  const separatorIndex = key.indexOf(':')
  if (separatorIndex <= 0) {
    return { namespaces: [...fallbackNamespaces], path: key }
  }

  const namespace = key.slice(0, separatorIndex).trim()
  const path = key.slice(separatorIndex + 1).trim()
  if (!namespace || !path) {
    return { namespaces: [...fallbackNamespaces], path: key }
  }

  return { namespaces: [namespace], path }
}

export function createRendererTranslator({
  locale = 'en',
  namespaces = RENDERER_I18N_NAMESPACES,
} = {}) {
  const normalizedNamespaces = Array.isArray(namespaces) && namespaces.length > 0
    ? namespaces.map((namespace) => String(namespace || '').trim()).filter(Boolean)
    : [...RENDERER_I18N_NAMESPACES]
  const resourceCandidates = resolveRendererResourceCandidates(locale)

  return function translateRendererText(key, options = {}) {
    const { defaultValue } = options || {}
    const interpolationValues = options && typeof options === 'object'
      ? Object.fromEntries(
        Object.entries(options).filter(([entryKey]) => entryKey !== 'defaultValue'),
      )
      : {}
    const { namespaces: keyNamespaces, path } = resolveNamespacedKey(key, normalizedNamespaces)

    for (const resourceLocale of resourceCandidates) {
      const localeResources = RENDERER_I18N_RESOURCES[resourceLocale]
      for (const namespace of keyNamespaces) {
        const namespaceResources = localeResources?.[namespace]
        const resolvedValue = readNestedValue(namespaceResources, path)
        if (typeof resolvedValue === 'string') {
          return interpolateText(resolvedValue, interpolationValues)
        }
      }
    }

    if (typeof defaultValue === 'string') {
      return interpolateText(defaultValue, interpolationValues)
    }

    return String(key || '')
  }
}
