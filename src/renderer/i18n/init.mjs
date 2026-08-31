import i18n from 'i18next'
import ICU from 'i18next-icu'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_UI_LOCALE,
  FALLBACK_UI_LOCALE,
  SHIPPED_UI_LOCALES,
  getUiLocaleFallbackChain,
  resolveRendererUiLocale,
} from '../../common/i18n/locale-config.mjs'
import {
  DEFAULT_RENDERER_I18N_NAMESPACE,
  RENDERER_I18N_NAMESPACES,
  RENDERER_I18N_RESOURCES,
  interpolateText,
} from './index.mjs'

let initializationPromise = null
let pluginsRegistered = false

const BRACE_COMPAT_POST_PROCESSOR_NAME = 'rendererBraceCompat'

const rendererBraceCompatPostProcessor = {
  name: BRACE_COMPAT_POST_PROCESSOR_NAME,
  type: 'postProcessor',
  process(value, _key, options) {
    return interpolateText(value, options)
  },
}

function getSystemLocaleOptions(overrides = {}) {
  const hasNavigator = typeof navigator !== 'undefined' && navigator
  const hasExplicitLanguage = typeof overrides.language === 'string'
  const hasExplicitLanguages = Array.isArray(overrides.languages)
  const language = hasExplicitLanguage
    ? overrides.language
    : (hasNavigator ? navigator.language : '')
  const languages = hasExplicitLanguages
    ? overrides.languages
    : hasExplicitLanguage
      ? []
    : (hasNavigator && Array.isArray(navigator.languages) ? navigator.languages : [])

  return { language, languages }
}

function registerRendererI18nPlugins() {
  if (pluginsRegistered) return
  i18n.use(ICU).use(rendererBraceCompatPostProcessor).use(initReactI18next)
  pluginsRegistered = true
}

export function resolveActiveRendererUiLocale(uiLocale = DEFAULT_UI_LOCALE, overrides = {}) {
  return resolveRendererUiLocale(uiLocale, getSystemLocaleOptions(overrides))
}

export async function initializeRendererI18n(options = {}) {
  const resolvedUiLocale = resolveActiveRendererUiLocale(options.uiLocale, options)

  if (!initializationPromise) {
    registerRendererI18nPlugins()
    initializationPromise = i18n.init({
      lng: resolvedUiLocale,
      fallbackLng: FALLBACK_UI_LOCALE,
      supportedLngs: [...SHIPPED_UI_LOCALES],
      load: 'currentOnly',
      ns: [...RENDERER_I18N_NAMESPACES],
      defaultNS: DEFAULT_RENDERER_I18N_NAMESPACE,
      interpolation: {
        escapeValue: false,
      },
      postProcess: [BRACE_COMPAT_POST_PROCESSOR_NAME],
      react: {
        useSuspense: false,
      },
      i18nFormat: {
        memoize: true,
      },
      resources: RENDERER_I18N_RESOURCES,
    }).catch((error) => {
      initializationPromise = null
      throw error
    })
  }

  await initializationPromise

  const fallbackChain = getUiLocaleFallbackChain(options.uiLocale, getSystemLocaleOptions(options))
  const targetLocale = fallbackChain[0] || FALLBACK_UI_LOCALE
  if (i18n.resolvedLanguage !== targetLocale || i18n.language !== targetLocale) {
    await i18n.changeLanguage(targetLocale)
  }

  return i18n
}

export async function syncRendererUiLocale(uiLocale = DEFAULT_UI_LOCALE, options = {}) {
  return initializeRendererI18n({
    ...options,
    uiLocale,
  })
}

export default i18n
