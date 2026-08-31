import { useCallback, useRef, useState } from 'react'
import { COMPLIANCE_MODE_STRICT } from '../../../common/compliance/compliance-settings.mjs'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import useSettingsStore from '../../store/useSettingsStore.js'

export default function useSettingsPanelDataManagement({
  activeProjectId,
  activeThreadId,
  complianceMode,
  exportCurrentThread,
  importThreadPayload,
  loadProviders,
  requestAppConfirm,
  showSettingsAlert,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const localDataSummary = useSettingsStore((s) => s.localDataSummary)
  const providerBudgetSummary = useSettingsStore((s) => s.providerBudgetSummary)
  const toolResultSpilloverSummary = useSettingsStore((s) => s.toolResultSpilloverSummary)
  const refreshLocalDataSummary = useSettingsStore((s) => s.refreshLocalDataSummary)
  const refreshProviderBudgetSummary = useSettingsStore((s) => s.refreshProviderBudgetSummary)
  const refreshToolResultSpilloverSummary = useSettingsStore((s) => s.refreshToolResultSpilloverSummary)
  const [exportPreflightOpen, setExportPreflightOpen] = useState(false)
  const [exportPreflightBusy, setExportPreflightBusy] = useState(false)
  const [exportPreserveCitations, setExportPreserveCitations] = useState(true)
  const [exportStrictConfirmed, setExportStrictConfirmed] = useState(false)
  const [importThreadModalOpen, setImportThreadModalOpen] = useState(false)
  const [importThreadBusy, setImportThreadBusy] = useState(false)
  const [importThreadJson, setImportThreadJson] = useState('')
  const [localDataActionBusy, setLocalDataActionBusy] = useState(false)
  const strictExportConfirmedRef = useRef(false)
  const handleDeleteApiKeysNow = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.deleteApiKeys !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.deleteFailed.title', { defaultValue: 'Delete Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.dataReset.dialogs.deleteApiKeys.title', { defaultValue: 'Delete API Keys' }),
      message: t('settings:blocks.dataReset.dialogs.deleteApiKeys.message', {
        defaultValue: 'Delete all stored API keys from this device now? Conversations, memory, artifacts, and settings will remain. This cannot be undone.',
      }),
      confirmLabel: t('settings:blocks.dataReset.dialogs.deleteApiKeys.confirm', {
        defaultValue: 'Delete API Keys',
      }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return
    setLocalDataActionBusy(true)
    try {
      await localDataApi.deleteApiKeys()
      await loadProviders(true)
      await refreshLocalDataSummary()
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.apiKeysDeleted.title', { defaultValue: 'API Keys Deleted' }),
        t('settings:blocks.dataReset.feedback.apiKeysDeleted.message', {
          defaultValue: 'Stored API keys were deleted from this device.',
        }),
      )
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.deleteFailed.title', { defaultValue: 'Delete Failed' }),
        t('settings:blocks.dataReset.feedback.deleteApiKeysFailed', {
          defaultValue: 'Failed to delete API keys: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setLocalDataActionBusy(false)
    }
  }, [loadProviders, refreshLocalDataSummary, requestAppConfirm, showSettingsAlert, t])

  const handleResetLocalDataAndRestart = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.resetAllAndRestart !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.resetFailed.title', { defaultValue: 'Reset Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.dataReset.dialogs.deleteAllLocalData.title', {
        defaultValue: 'Delete All Local Data',
      }),
      message: t('settings:blocks.dataReset.dialogs.deleteAllLocalData.message', {
        defaultValue: 'Delete all ADDOM local data for this profile and restart? This removes API keys, conversations, memory logs, artifacts, project sessions, cached attachments, local model cache, and settings. Export anything you need first. This cannot be undone.',
      }),
      confirmLabel: t('settings:blocks.dataReset.dialogs.deleteAllLocalData.confirm', {
        defaultValue: 'Delete and Restart',
      }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return
    setLocalDataActionBusy(true)
    try {
      await localDataApi.resetAllAndRestart()
      setLocalDataActionBusy(false)
    } catch (err) {
      setLocalDataActionBusy(false)
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.resetFailed.title', { defaultValue: 'Reset Failed' }),
        t('settings:blocks.dataReset.feedback.deleteLocalDataFailed', {
          defaultValue: 'Failed to delete local data: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    }
  }, [requestAppConfirm, showSettingsAlert, t])

  const handleRefreshProviderBudgetSummary = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.getProviderBudgetSummary !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.refreshFailed.title', { defaultValue: 'Refresh Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    setLocalDataActionBusy(true)
    try {
      const summary = await refreshProviderBudgetSummary()
      if (!summary) {
        throw new Error(t('settings:blocks.dataReset.feedback.refreshFailed.providerBudgetDefaultMessage', {
          defaultValue: 'Unable to refresh learned provider budget summary.',
        }))
      }
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.refreshFailed.title', { defaultValue: 'Refresh Failed' }),
        t('settings:blocks.dataReset.feedback.refreshProviderBudgetFailed', {
          defaultValue: 'Failed to refresh learned provider budgets: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setLocalDataActionBusy(false)
    }
  }, [refreshProviderBudgetSummary, showSettingsAlert, t])

  const handleCleanupProviderBudgetProfiles = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.cleanupProviderBudgetProfiles !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.deleteFailed.title', { defaultValue: 'Delete Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.dataReset.dialogs.cleanupProviderBudgets.title', {
        defaultValue: 'Cleanup Learned Budgets',
      }),
      message: t('settings:blocks.dataReset.dialogs.cleanupProviderBudgets.message', {
        defaultValue: 'Delete invalid or long-unused expired learned provider budget profiles? Recent active profiles will remain.',
      }),
      confirmLabel: t('settings:blocks.dataReset.dialogs.cleanupProviderBudgets.confirm', {
        defaultValue: 'Cleanup',
      }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'warning',
    })
    if (!confirmed) return
    setLocalDataActionBusy(true)
    try {
      const result = await localDataApi.cleanupProviderBudgetProfiles()
      await refreshProviderBudgetSummary()
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.providerBudgetCleanupComplete.title', {
          defaultValue: 'Cleanup Complete',
        }),
        t('settings:blocks.dataReset.feedback.providerBudgetCleanupComplete.message', {
          defaultValue: 'Removed {{count}} learned budget profile(s).',
          count: Math.max(0, Number(result?.deletedCount || 0) || 0),
        }),
      )
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.deleteFailed.title', { defaultValue: 'Delete Failed' }),
        t('settings:blocks.dataReset.feedback.providerBudgetCleanupFailed', {
          defaultValue: 'Failed to cleanup learned provider budgets: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setLocalDataActionBusy(false)
    }
  }, [refreshProviderBudgetSummary, requestAppConfirm, showSettingsAlert, t])

  const handleResetProviderBudgetProfiles = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.resetProviderBudgetProfiles !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.resetFailed.title', { defaultValue: 'Reset Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.dataReset.dialogs.resetProviderBudgets.title', {
        defaultValue: 'Reset Learned Budgets',
      }),
      message: t('settings:blocks.dataReset.dialogs.resetProviderBudgets.message', {
        defaultValue: 'Delete all learned provider budget profiles from this profile? This removes adaptive budget history until new observations are recorded.',
      }),
      confirmLabel: t('settings:blocks.dataReset.dialogs.resetProviderBudgets.confirm', {
        defaultValue: 'Reset Budgets',
      }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return
    setLocalDataActionBusy(true)
    try {
      const result = await localDataApi.resetProviderBudgetProfiles()
      await refreshProviderBudgetSummary()
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.providerBudgetResetComplete.title', {
          defaultValue: 'Reset Complete',
        }),
        t('settings:blocks.dataReset.feedback.providerBudgetResetComplete.message', {
          defaultValue: 'Removed {{count}} learned budget profile(s).',
          count: Math.max(0, Number(result?.deletedCount || 0) || 0),
        }),
      )
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.resetFailed.title', { defaultValue: 'Reset Failed' }),
        t('settings:blocks.dataReset.feedback.providerBudgetResetFailed', {
          defaultValue: 'Failed to reset learned provider budgets: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setLocalDataActionBusy(false)
    }
  }, [refreshProviderBudgetSummary, requestAppConfirm, showSettingsAlert, t])

  const handleRefreshToolResultSpilloverSummary = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.getToolResultSpilloverSummary !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.refreshFailed.title', { defaultValue: 'Refresh Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    setLocalDataActionBusy(true)
    try {
      const summary = await refreshToolResultSpilloverSummary()
      if (!summary) {
        throw new Error(t('settings:blocks.dataReset.feedback.refreshFailed.spilloverDefaultMessage', {
          defaultValue: 'Unable to refresh tool result spillover summary.',
        }))
      }
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.refreshFailed.title', { defaultValue: 'Refresh Failed' }),
        t('settings:blocks.dataReset.feedback.refreshToolResultSpilloverFailed', {
          defaultValue: 'Failed to refresh tool result spillover: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setLocalDataActionBusy(false)
    }
  }, [refreshToolResultSpilloverSummary, showSettingsAlert, t])

  const handleCleanupToolResultSpillover = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.cleanupToolResultSpillover !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.deleteFailed.title', { defaultValue: 'Delete Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.dataReset.dialogs.cleanupToolResultSpillover.title', {
        defaultValue: 'Prune Spillover',
      }),
      message: t('settings:blocks.dataReset.dialogs.cleanupToolResultSpillover.message', {
        defaultValue: 'Prune expired or over-budget tool result spillover files from this profile? Recent spillovers needed by current retention policy will remain.',
      }),
      confirmLabel: t('settings:blocks.dataReset.dialogs.cleanupToolResultSpillover.confirm', {
        defaultValue: 'Prune Spillover',
      }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'warning',
    })
    if (!confirmed) return
    setLocalDataActionBusy(true)
    try {
      const result = await localDataApi.cleanupToolResultSpillover()
      await refreshToolResultSpilloverSummary()
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.toolResultSpilloverCleanupComplete.title', {
          defaultValue: 'Prune Complete',
        }),
        t('settings:blocks.dataReset.feedback.toolResultSpilloverCleanupComplete.message', {
          defaultValue: 'Removed {{count}} spillover file(s).',
          count: Math.max(0, Number(result?.deletedCount || 0) || 0),
        }),
      )
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.deleteFailed.title', { defaultValue: 'Delete Failed' }),
        t('settings:blocks.dataReset.feedback.toolResultSpilloverCleanupFailed', {
          defaultValue: 'Failed to prune tool result spillover: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setLocalDataActionBusy(false)
    }
  }, [refreshToolResultSpilloverSummary, requestAppConfirm, showSettingsAlert, t])

  const handleResetToolResultSpillover = useCallback(async () => {
    const localDataApi = window?.addom?.localData
    if (!localDataApi || typeof localDataApi.resetToolResultSpillover !== 'function') {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.resetFailed.title', { defaultValue: 'Reset Failed' }),
        t('settings:blocks.dataReset.feedback.localDataApiUnavailable', {
          defaultValue: 'Local data API is unavailable.',
        }),
        'danger',
      )
      return
    }
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.dataReset.dialogs.resetToolResultSpillover.title', {
        defaultValue: 'Clear Spillover',
      }),
      message: t('settings:blocks.dataReset.dialogs.resetToolResultSpillover.message', {
        defaultValue: 'Delete all persisted tool result spillover files from this profile? This does not change retention policy and cannot be undone.',
      }),
      confirmLabel: t('settings:blocks.dataReset.dialogs.resetToolResultSpillover.confirm', {
        defaultValue: 'Clear Spillover',
      }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return
    setLocalDataActionBusy(true)
    try {
      const result = await localDataApi.resetToolResultSpillover()
      await refreshToolResultSpilloverSummary()
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.toolResultSpilloverResetComplete.title', {
          defaultValue: 'Spillover Cleared',
        }),
        t('settings:blocks.dataReset.feedback.toolResultSpilloverResetComplete.message', {
          defaultValue: 'Removed {{count}} spillover file(s).',
          count: Math.max(0, Number(result?.deletedCount || 0) || 0),
        }),
      )
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.resetFailed.title', { defaultValue: 'Reset Failed' }),
        t('settings:blocks.dataReset.feedback.toolResultSpilloverResetFailed', {
          defaultValue: 'Failed to clear tool result spillover: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setLocalDataActionBusy(false)
    }
  }, [refreshToolResultSpilloverSummary, requestAppConfirm, showSettingsAlert, t])

  const logComplianceEvent = useCallback((payload = {}) => {
    const chatApi = window?.addom?.chat
    if (!chatApi || typeof chatApi.logComplianceEvent !== 'function') return
    const threadId = String(payload?.threadId || activeThreadId || '').trim()
    if (!threadId) return
    chatApi.logComplianceEvent({
      ...payload,
      threadId,
    })
  }, [activeThreadId])

  const executeThreadExport = useCallback(async ({
    preserveCitations = true,
  } = {}) => {
    if (!activeThreadId) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.threadRequired.title', { defaultValue: 'Thread Required' }),
        t('settings:blocks.dataReset.feedback.threadRequired.message', {
          defaultValue: 'No active thread selected.',
        }),
        'warning',
      )
      return false
    }
    try {
      const exported = await exportCurrentThread({
        preserveCitations: preserveCitations !== false,
      })
      const serialized = JSON.stringify(exported, null, 2)
      let copied = false
      try {
        await navigator?.clipboard?.writeText?.(serialized)
        copied = true
      } catch {
        copied = false
      }
      try {
        const blob = new Blob([serialized], { type: 'application/json' })
        const href = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = href
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        anchor.download = `addom-thread-export-${ts}.json`
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        URL.revokeObjectURL(href)
      } catch {
        // Non-fatal; clipboard fallback may still succeed.
      }
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.exportComplete.title', { defaultValue: 'Export Complete' }),
        copied
          ? t('settings:blocks.dataReset.feedback.exportComplete.copiedMessage', {
            defaultValue: 'Thread exported. JSON copied to clipboard and download started.',
          })
          : t('settings:blocks.dataReset.feedback.exportComplete.downloadMessage', {
            defaultValue: 'Thread export created and download started.',
          }),
      )
      return true
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.exportFailed.title', { defaultValue: 'Export Failed' }),
        t('settings:blocks.dataReset.feedback.exportFailed.message', {
          defaultValue: 'Failed to export thread: {{message}}',
          message: err.message,
        }),
        'danger',
      )
      return false
    } finally {
      setExportPreflightBusy(false)
    }
  }, [activeThreadId, exportCurrentThread, showSettingsAlert, t])

  const handleExportCurrentThread = useCallback(async () => {
    if (!activeThreadId) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.threadRequired.title', { defaultValue: 'Thread Required' }),
        t('settings:blocks.dataReset.feedback.threadRequired.message', {
          defaultValue: 'No active thread selected.',
        }),
        'warning',
      )
      return
    }
    if (complianceMode === 'off') {
      await executeThreadExport({ preserveCitations: true })
      return
    }
    if (complianceMode === COMPLIANCE_MODE_STRICT && strictExportConfirmedRef.current) {
      await executeThreadExport({ preserveCitations: true })
      return
    }
    setExportPreserveCitations(true)
    setExportStrictConfirmed(false)
    setExportPreflightOpen(true)
    logComplianceEvent({
      noticeAction: 'shown',
      noticeType: 'export_preflight',
      source: 'settings_data_reset',
      summary: 'Export compliance preflight shown before thread export.',
      preserveCitations: true,
      strictMode: complianceMode === COMPLIANCE_MODE_STRICT,
    })
  }, [activeThreadId, complianceMode, executeThreadExport, logComplianceEvent, showSettingsAlert, t])

  const handleCancelExportPreflight = useCallback(() => {
    if (exportPreflightBusy) return
    logComplianceEvent({
      noticeAction: 'skipped',
      noticeType: 'export_preflight',
      source: 'settings_data_reset',
      summary: 'Export compliance preflight was dismissed.',
      preserveCitations: !!exportPreserveCitations,
      strictMode: complianceMode === COMPLIANCE_MODE_STRICT,
    })
    setExportPreflightOpen(false)
  }, [complianceMode, exportPreflightBusy, exportPreserveCitations, logComplianceEvent])

  const handleConfirmExportPreflight = useCallback(async () => {
    if (complianceMode === COMPLIANCE_MODE_STRICT && !exportStrictConfirmed) {
      return
    }
    setExportPreflightBusy(true)
    logComplianceEvent({
      noticeAction: 'acknowledged',
      noticeType: 'export_preflight',
      source: 'settings_data_reset',
      summary: 'Export compliance preflight was acknowledged.',
      preserveCitations: !!exportPreserveCitations,
      strictMode: complianceMode === COMPLIANCE_MODE_STRICT,
    })
    const ok = await executeThreadExport({ preserveCitations: !!exportPreserveCitations })
    if (ok) {
      setExportPreflightOpen(false)
      if (complianceMode === COMPLIANCE_MODE_STRICT) {
        strictExportConfirmedRef.current = true
      }
    }
  }, [complianceMode, executeThreadExport, exportPreserveCitations, exportStrictConfirmed, logComplianceEvent])

  const handleOpenImportThreadModal = useCallback(async () => {
    if (!activeProjectId) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.projectRequired.title', { defaultValue: 'Project Required' }),
        t('settings:blocks.dataReset.feedback.projectRequired.message', {
          defaultValue: 'No active project selected.',
        }),
        'warning',
      )
      return
    }
    setImportThreadJson('')
    setImportThreadModalOpen(true)
  }, [activeProjectId, showSettingsAlert, t])

  const handleCancelImportThreadModal = useCallback(() => {
    if (importThreadBusy) return
    setImportThreadModalOpen(false)
  }, [importThreadBusy])

  const handleConfirmImportThreadModal = useCallback(async () => {
    const raw = String(importThreadJson || '').trim()
    if (!raw) return

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.invalidJson.title', { defaultValue: 'Invalid JSON' }),
        t('settings:blocks.dataReset.feedback.invalidJson.message', {
          defaultValue: 'Invalid JSON payload.',
        }),
        'warning',
      )
      return
    }

    setImportThreadBusy(true)
    try {
      const result = await importThreadPayload(payload)
      const title = String(result?.thread?.title || t('settings:blocks.dataReset.importFallbackTitle', {
        defaultValue: 'Imported Thread',
      }))
      const importedEvents = Number(result?.importedEvents || 0)
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.importComplete.title', { defaultValue: 'Import Complete' }),
        t(
          importedEvents === 1
            ? 'settings:blocks.dataReset.feedback.importComplete.messageOne'
            : 'settings:blocks.dataReset.feedback.importComplete.messageOther',
          {
            title,
            count: importedEvents,
            defaultValue: importedEvents === 1
              ? 'Imported thread "{{title}}" with {{count}} event.'
              : 'Imported thread "{{title}}" with {{count}} events.',
          },
        ),
      )
      setImportThreadModalOpen(false)
      setImportThreadJson('')
    } catch (err) {
      await showSettingsAlert(
        t('settings:blocks.dataReset.feedback.importFailed.title', { defaultValue: 'Import Failed' }),
        t('settings:blocks.dataReset.feedback.importFailed.message', {
          defaultValue: 'Failed to import thread: {{message}}',
          message: err.message,
        }),
        'danger',
      )
    } finally {
      setImportThreadBusy(false)
    }
  }, [importThreadJson, importThreadPayload, showSettingsAlert, t])

  return {
    exportPreflightOpen,
    exportPreflightBusy,
    exportPreserveCitations,
    exportStrictConfirmed,
    importThreadModalOpen,
    importThreadBusy,
    importThreadJson,
    localDataSummary,
    providerBudgetSummary,
    toolResultSpilloverSummary,
    localDataActionBusy,
    setExportPreserveCitations,
    setExportStrictConfirmed,
    setImportThreadJson,
    handleDeleteApiKeysNow,
    handleResetLocalDataAndRestart,
    handleRefreshProviderBudgetSummary,
    handleCleanupProviderBudgetProfiles,
    handleResetProviderBudgetProfiles,
    handleRefreshToolResultSpilloverSummary,
    handleCleanupToolResultSpillover,
    handleResetToolResultSpillover,
    handleExportCurrentThread,
    handleCancelExportPreflight,
    handleConfirmExportPreflight,
    handleOpenImportThreadModal,
    handleCancelImportThreadModal,
    handleConfirmImportThreadModal,
  }
}
