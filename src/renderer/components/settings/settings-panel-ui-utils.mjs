import React from 'react'
import { DEFAULT_UI_LOCALE } from '../../../common/i18n/locale-config.mjs'
import { resolveActiveRendererUiLocale } from '../../i18n/init.mjs'
import { createRendererTranslator } from '../../i18n/index.mjs'
import useSettingsStore from '../../store/useSettingsStore.js'

export const DEFAULT_COMMAND_SAFETY = Object.freeze({
  showDeveloperOptions: false,
  installSandboxEnabled: false,
  installSandboxIgnoreScriptsFirstPass: false,
  preferredBackend: 'auto',
  sandboxNetworkEnforcementMode: 'strict',
  registryAllowlist: [],
  cacheDirs: [],
  allowGlobalSystemInstalls: false,
  allowOutsideWorkspaceMutation: false,
  allowPrivilegedHostOps: false,
  allowPrivateNetworkTargets: false,
})

export const SETTINGS_NAV_GROUPS = Object.freeze([
  { id: 'general', labelKey: 'settings:categories.general.label', defaultLabel: 'General', categoryIds: ['general'] },
  { id: 'appearance', labelKey: 'settings:categories.appearance.label', defaultLabel: 'Appearance', categoryIds: ['appearance'] },
  { id: 'terminal', labelKey: 'settings:categories.terminal.label', defaultLabel: 'Terminal', categoryIds: ['terminal'] },
  { id: 'agents', labelKey: 'settings:categories.agents.label', defaultLabel: 'Agents', categoryIds: ['agents'] },
  { id: 'providers', labelKey: 'settings:categories.providers.label', defaultLabel: 'Providers', categoryIds: ['providers'] },
  { id: 'safety', labelKey: 'settings:categories.toolsSafety.label', defaultLabel: 'Safety', categoryIds: ['tools_safety'] },
  { id: 'data', labelKey: 'settings:categories.dataPrivacy.label', defaultLabel: 'Data', categoryIds: ['data_privacy'] },
])

const DEFAULT_SETTINGS_TRANSLATOR = createRendererTranslator({
  locale: DEFAULT_UI_LOCALE,
  namespaces: ['settings', 'core'],
})

export function useSettingsTranslator(namespaces = ['settings', 'core']) {
  const uiLocale = useSettingsStore((state) => state.uiLocale)
  const normalizedNamespaces = React.useMemo(
    () => (
      Array.isArray(namespaces) && namespaces.length > 0
        ? namespaces.map((namespace) => String(namespace || '').trim()).filter(Boolean)
        : ['settings', 'core']
    ),
    [namespaces],
  )
  const resolvedLocale = resolveActiveRendererUiLocale(uiLocale)

  return React.useMemo(() => createRendererTranslator({
    locale: resolvedLocale,
    namespaces: normalizedNamespaces,
  }), [resolvedLocale, normalizedNamespaces])
}

export function getDefaultSettingsTranslator() {
  return DEFAULT_SETTINGS_TRANSLATOR
}

export function localizeSettingsNavGroups(t, groups = SETTINGS_NAV_GROUPS) {
  const translate = typeof t === 'function' ? t : DEFAULT_SETTINGS_TRANSLATOR
  return groups.map((group) => ({
    ...group,
    label: translate(group.labelKey, { defaultValue: group.defaultLabel }),
  }))
}

export function formatSectionCountBadge(t, count = 0) {
  const translate = typeof t === 'function' ? t : DEFAULT_SETTINGS_TRANSLATOR
  const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Math.round(Number(count))) : 0
  return normalizedCount === 1
    ? translate('core:settings.counts.sectionOne', { count: 1, defaultValue: '1 section' })
    : translate('core:settings.counts.sectionOther', { count: normalizedCount, defaultValue: '{{count}} sections' })
}

export function formatVisibleSectionCountLabel(t, count = 0) {
  const translate = typeof t === 'function' ? t : DEFAULT_SETTINGS_TRANSLATOR
  const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Math.round(Number(count))) : 0
  return normalizedCount === 1
    ? translate('core:settings.counts.visibleSectionOne', { count: 1, defaultValue: '1 visible section' })
    : translate('core:settings.counts.visibleSectionOther', { count: normalizedCount, defaultValue: '{{count}} visible sections' })
}

export function clampThreshold(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 50
  return Math.max(5, Math.min(500, Math.round(n)))
}

function normalizeStringListForUi(value, maxItems = 50) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((v) => String(v || '').trim()).filter(Boolean))).slice(0, maxItems)
    : []
}

export function normalizeWorkspaceRootForCompare(root) {
  return String(root || '').trim().toLowerCase()
}

export function normalizeCommandSafetyForUi(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const backend = String(source.preferredBackend || source.installSandboxBackend || 'auto').trim().toLowerCase()
  const networkEnforcementMode = String(
    source.sandboxNetworkEnforcementMode || source.networkEnforcementMode || source.installSandboxNetworkEnforcement || 'strict',
  ).trim().toLowerCase()
  return {
    showDeveloperOptions: typeof source.showDeveloperOptions === 'boolean'
      ? source.showDeveloperOptions
      : typeof source.developerOptionsVisible === 'boolean'
        ? source.developerOptionsVisible
        : false,
    installSandboxEnabled: !!source.installSandboxEnabled,
    installSandboxIgnoreScriptsFirstPass: !!(source.installSandboxIgnoreScriptsFirstPass || source.ignoreScriptsFirstPass),
    preferredBackend: (backend === 'docker' || backend === 'wsl' || backend === 'none') ? backend : 'auto',
    sandboxNetworkEnforcementMode: networkEnforcementMode === 'strict' ? 'strict' : 'best_effort',
    registryAllowlist: normalizeStringListForUi(source.registryAllowlist, 50),
    cacheDirs: normalizeStringListForUi(source.cacheDirs, 20),
    allowGlobalSystemInstalls: !!source.allowGlobalSystemInstalls,
    allowOutsideWorkspaceMutation: !!source.allowOutsideWorkspaceMutation,
    allowPrivilegedHostOps: !!source.allowPrivilegedHostOps,
    allowPrivateNetworkTargets: !!source.allowPrivateNetworkTargets,
  }
}

export function listToDraft(lines = []) {
  return Array.isArray(lines) && lines.length > 0 ? lines.join('\n') : ''
}

export function parseDraftList(text, maxItems = 50) {
  return Array.from(new Set(
    String(text || '')
      .split(/\r?\n|,/g)
      .map((v) => String(v || '').trim())
      .filter(Boolean),
  )).slice(0, maxItems)
}
