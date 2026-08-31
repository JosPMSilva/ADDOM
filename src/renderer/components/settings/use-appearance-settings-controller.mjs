import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_APPEARANCE_SETTINGS,
  normalizeAppearanceSettings,
} from '../../../common/ui/appearance-settings.mjs'
import {
  applyAppearanceSettings,
  getResolvedAppearanceMode,
  subscribeAppearanceChanges,
} from '../../theme/appearance-runtime.mjs'
import useSettingsStore from '../../store/useSettingsStore.js'

export default function useAppearanceSettingsController({
  coreSettings = null,
  initialAppearanceSettings = null,
  showSettingsAlert = () => {},
  t = (_key, options = {}) => options.defaultValue || '',
} = {}) {
  const [appearanceSettings, setAppearanceSettings] = useState(
    () => normalizeAppearanceSettings(initialAppearanceSettings || DEFAULT_APPEARANCE_SETTINGS),
  )
  const [resolvedAppearance, setResolvedAppearance] = useState(getResolvedAppearanceMode)

  useEffect(() => subscribeAppearanceChanges(({ resolvedMode }) => {
    setResolvedAppearance(resolvedMode)
  }), [])

  useEffect(() => {
    if (!coreSettings?.appearance) return
    setAppearanceSettings(normalizeAppearanceSettings(coreSettings.appearance))
  }, [coreSettings?.appearance])

  const handleAppearanceModeChange = useCallback((nextMode) => {
    const normalized = normalizeAppearanceSettings({ mode: nextMode })
    const previousCoreSettings = useSettingsStore.getState().coreSettings || coreSettings
    const previousAppearance = normalizeAppearanceSettings(
      previousCoreSettings?.appearance || appearanceSettings,
    )

    setAppearanceSettings(normalized)
    applyAppearanceSettings(normalized)
    if (previousCoreSettings) {
      useSettingsStore.getState().cacheCoreSettings({
        ...previousCoreSettings,
        appearance: normalized,
      })
    }

    const settingsApi = window?.addom?.settings
    if (!settingsApi || typeof settingsApi.set !== 'function') return
    settingsApi.set({ appearance: normalized })
      .then((persistedSettings) => {
        if (persistedSettings && typeof persistedSettings === 'object') {
          useSettingsStore.getState().cacheCoreSettings(persistedSettings)
        }
      })
      .catch(() => {
        setAppearanceSettings(previousAppearance)
        applyAppearanceSettings(previousAppearance)
        if (previousCoreSettings) useSettingsStore.getState().cacheCoreSettings(previousCoreSettings)
        void showSettingsAlert(
          t('settings:alerts.appearanceSaveFailed.title', { defaultValue: 'Theme Save Failed' }),
          t('settings:alerts.appearanceSaveFailed.message', {
            defaultValue: 'ADDOM could not persist the selected theme.',
          }),
          'danger',
        )
      })
  }, [appearanceSettings, coreSettings, showSettingsAlert, t])

  return { appearanceSettings, resolvedAppearance, handleAppearanceModeChange }
}
