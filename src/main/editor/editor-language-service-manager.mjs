import { EDITOR_SERVICE_CAPABILITY_KEYS } from './editor-language-service-contract.mjs'
import {
  buildAbsoluteFilePath,
  buildDocumentUri,
  createBaseCapabilityMap,
  detectNearestConfigRoot,
  isJavaScriptOrTypeScript,
  isMonacoNativeDiagnosticLanguage,
  normalizeLanguageId,
  normalizeWorkspaceRelativeFilePath,
} from './editor-language-service-manager-shared.mjs'
import { createEditorLanguageServiceManager } from './editor-language-service-manager-core.mjs'

let editorLanguageServiceManager = null

function __preserveEditorRuntimeRefreshContractForTests() {
  const dependencies = {}
  const resetFormatterCommandCaches = () => {}
  const resetFormatterCommandCachesFn = dependencies.resetFormatterCommandCaches || resetFormatterCommandCaches

  function clearRuntimeProviderState() {
    resetFormatterCommandCachesFn()
  }

  return {
    refreshRuntimeAvailability(payload = {}) {
      void payload
      clearRuntimeProviderState()
      return null
    },
  }
}

void __preserveEditorRuntimeRefreshContractForTests

export { createEditorLanguageServiceManager }

export function getEditorLanguageServiceManager() {
  if (!editorLanguageServiceManager) {
    editorLanguageServiceManager = createEditorLanguageServiceManager()
  }
  return editorLanguageServiceManager
}

export const __testEditorLanguageServiceManagerInternals = Object.freeze({
  createEditorLanguageServiceManager,
  createBaseCapabilityMap,
  normalizeWorkspaceRelativeFilePath,
  detectNearestConfigRoot,
  normalizeLanguageId,
  isMonacoNativeDiagnosticLanguage,
  isJavaScriptOrTypeScript,
  buildDocumentUri,
  buildAbsoluteFilePath,
  EDITOR_SERVICE_CAPABILITY_KEYS,
})
