import { useCallback, useMemo } from 'react'
import useSettingsStore from '../../store/useSettingsStore.js'
import { normalizeComposerAgentRoles } from './chat-panel-helpers.mjs'

export function useChatPanelAgentRoles() {
  const coreSettings = useSettingsStore((s) => s.coreSettings)
  const coreSettingsLoading = useSettingsStore((s) => s.coreSettingsLoading)
  const ensureCoreSettingsHydrated = useSettingsStore((s) => s.ensureCoreSettingsHydrated)

  const loadComposerAgentRoles = useCallback(async () => {
    await ensureCoreSettingsHydrated()
  }, [ensureCoreSettingsHydrated])

  const composerAgentRoles = useMemo(() => {
    return normalizeComposerAgentRoles(coreSettings?.moaRoles || [])
  }, [coreSettings?.moaRoles])

  const composerAgentRolesLoading = !coreSettings && coreSettingsLoading

  return {
    composerAgentRoles,
    composerAgentRolesLoading,
    loadComposerAgentRoles,
  }
}
