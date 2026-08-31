function createAppApi({ invokeVersioned, sendVersioned, requireNonEmptyString }) {
  return {
    openLegalDocument: (documentId) => invokeVersioned('app:openLegalDocument', requireNonEmptyString(documentId, 'documentId')),
    startupReady: () => sendVersioned('app:startup-ready'),
  }
}

function createWindowApi({ sendVersioned }) {
  return {
    minimize: () => sendVersioned('window:minimize'),
    maximize: () => sendVersioned('window:maximize'),
    close: () => sendVersioned('window:close'),
  }
}

function createDialogApi({ invokeVersioned }) {
  return {
    openFolder: () => invokeVersioned('dialog:openFolder'),
    openFiles: () => invokeVersioned('dialog:openFiles'),
  }
}

function createShellApi(deps) {
  const { invokeVersioned, requireNonEmptyString, normalizeHttpUrl } = deps
  return {
    openPath: (p) => invokeVersioned('shell:openPath', requireNonEmptyString(p, 'path')),
    showOpenContainingFolderMenu: (p) => invokeVersioned('shell:showOpenContainingFolderMenu', requireNonEmptyString(p, 'path')),
    openExternal: (url) => invokeVersioned('shell:openExternal', normalizeHttpUrl(url)),
    openAttachmentFile: (payload) => invokeVersioned('shell:openAttachmentFile', payload || {}),
  }
}

function createClipboardApi({ invokeVersioned, asString }) {
  return {
    readText: () => invokeVersioned('clipboard:readText'),
    writeText: (value = '') => invokeVersioned('clipboard:writeText', asString(value)),
  }
}

function createUpdaterApi({ invokeVersioned, subVersioned }) {
  return {
    checkForUpdates: () => invokeVersioned('updater:checkForUpdates'),
    downloadUpdate: () => invokeVersioned('updater:downloadUpdate'),
    installUpdate: () => invokeVersioned('updater:installUpdate'),
    onChecking: (cb) => subVersioned('updater:checking', cb),
    onAvailable: (cb) => subVersioned('updater:available', cb),
    onNotAvailable: (cb) => subVersioned('updater:not-available', cb),
    onError: (cb) => subVersioned('updater:error', cb),
    onProgress: (cb) => subVersioned('updater:progress', cb),
    onDownloaded: (cb) => subVersioned('updater:downloaded', cb),
  }
}

function createSettingsApi({ invokeVersioned, subVersioned }) {
  return {
    get: () => invokeVersioned('settings:get'),
    set: (patch) => invokeVersioned('settings:set', { patch }),
    setProviderAuthMethod: (providerId, authMethod) => invokeVersioned('provider-auth:set-method', { providerId, authMethod }),
    setProviderRuntimeSettings: (providerId, runtimeSettings) => invokeVersioned('provider-runtime-settings:set', { providerId, runtimeSettings }),
    setMoaRoles: (moaRoles) => invokeVersioned('moa-roles:set', { moaRoles: Array.isArray(moaRoles) ? moaRoles : [] }),
    onUpdated: (cb) => subVersioned('settings:updated', cb),
    getAdvancedConfigDiagnostics: () => invokeVersioned('advanced-config:get-diagnostics'),
    reloadAdvancedConfig: () => invokeVersioned('advanced-config:reload'),
    getAdvancedConfigSecurityWarning: () => invokeVersioned('advanced-config:security-warning'),
    getEffectiveSourceDiagnostics: () => invokeVersioned('settings:get-effective-source-diagnostics'),
    detectInstallSandboxBackend: (commandSafety = null) => invokeVersioned('settings:detect-install-sandbox-backend', {
      ...(commandSafety && typeof commandSafety === 'object' ? { commandSafety } : {}),
    }),
    getCommandSafetyTelemetry: () => invokeVersioned('settings:get-command-safety-telemetry'),
    clearCommandSafetyTelemetry: () => invokeVersioned('settings:clear-command-safety-telemetry'),
    getInlineCompletionTelemetry: () => invokeVersioned('settings:get-inline-completion-telemetry'),
    clearInlineCompletionTelemetry: () => invokeVersioned('settings:clear-inline-completion-telemetry'),
    onSecurityWarning: (cb) => subVersioned('settings:security-warning', cb),
  }
}

function createLocalDataApi({ invokeVersioned }) {
  return {
    getSummary: () => invokeVersioned('local-data:get-summary'),
    getProviderBudgetSummary: () => invokeVersioned('local-data:get-provider-budget-summary'),
    cleanupProviderBudgetProfiles: () => invokeVersioned('local-data:cleanup-provider-budget-profiles'),
    resetProviderBudgetProfiles: () => invokeVersioned('local-data:reset-provider-budget-profiles'),
    getToolResultSpilloverSummary: () => invokeVersioned('local-data:get-tool-result-spillover-summary'),
    cleanupToolResultSpillover: () => invokeVersioned('local-data:cleanup-tool-result-spillover'),
    resetToolResultSpillover: () => invokeVersioned('local-data:reset-tool-result-spillover'),
    deleteApiKeys: () => invokeVersioned('local-data:delete-api-keys'),
    resetAllAndRestart: () => invokeVersioned('local-data:reset-all-and-restart'),
  }
}

function createSystemApi({ invokeVersioned }) {
  return {
    getGitUserName: () => invokeVersioned('system:getGitUserName'),
  }
}

module.exports = {
  createAppApi,
  createWindowApi,
  createDialogApi,
  createShellApi,
  createClipboardApi,
  createUpdaterApi,
  createSettingsApi,
  createLocalDataApi,
  createSystemApi,
}
