import {
  ESLINT_CONFIG_FILES,
  cleanString,
  createMonacoNativeOwnership,
  createProviderOwnership,
  createSyntaxOnlyOwnership,
  detectNearestConfigRoot,
  isJavaScriptOrTypeScript,
  isMonacoNativeDiagnosticLanguage,
  isPythonLanguage,
  normalizeDiagnosticMessage,
  normalizeLanguageId,
  normalizeLspDiagnosticMessage,
} from './editor-language-service-manager-shared.mjs'

export function createEditorLanguageServiceDiagnosticsRequester(context = {}) {
  const {
    isFormatOnlyLanguageFn,
    lintTextViaWorkerFn,
    ensureProviderSession,
    setProviderHealth,
    logProviderFailure,
    buildServiceState,
  } = context

  async function requestDiagnostics(document = null) {
    const doc = document && typeof document === 'object' ? document : null
    if (!doc) return { ok: false, error: 'document_not_found' }

    const language = normalizeLanguageId(doc.language, doc.filePath)
    if (isFormatOnlyLanguageFn(doc.filePath, language)) {
      return {
        ok: true,
        available: false,
        diagnostics: [],
        diagnosticOwnership: createSyntaxOnlyOwnership('Format-only languages do not expose diagnostics in the editor service.'),
        serviceState: buildServiceState(doc),
      }
    }
    if (isMonacoNativeDiagnosticLanguage(language)) {
      return {
        ok: true,
        available: true,
        diagnostics: [],
        diagnosticOwnership: createMonacoNativeOwnership(),
        serviceState: buildServiceState(doc),
      }
    }

    if (isJavaScriptOrTypeScript(language)) {
      const eslintRoot = detectNearestConfigRoot(doc.projectFolder, doc.filePath, ESLINT_CONFIG_FILES)
      if (!eslintRoot) {
        setProviderHealth('eslint', {
          status: 'unavailable',
          root: doc.projectFolder,
          source: 'syntax-only',
          message: 'Project-configured ESLint was not found. Semantic diagnostics stay off.',
        })
        return {
          ok: true,
          available: false,
          diagnostics: [],
          diagnosticOwnership: createSyntaxOnlyOwnership('Project-configured ESLint was not found. Semantic diagnostics stay off.'),
          serviceState: buildServiceState(doc),
        }
      }

      const result = await lintTextViaWorkerFn({
        project: eslintRoot,
        filePath: doc.filePath,
        content: doc.content,
        language,
      })

      if (result?.ok && result?.available && result?.source === 'project-config') {
        setProviderHealth('eslint', {
          status: 'healthy',
          root: eslintRoot,
          source: 'project-config',
          message: 'Project-configured ESLint diagnostics are healthy.',
        })
        return {
          ok: true,
          available: true,
          diagnostics: Array.isArray(result.messages)
            ? result.messages.map((message) => normalizeDiagnosticMessage(message))
            : [],
          diagnosticOwnership: createProviderOwnership('eslint-project-config', 'Project-configured ESLint owns diagnostics for this file.'),
          serviceState: buildServiceState(doc),
        }
      }

      const failureMessage = cleanString(result?.message)
        || (result?.source === 'addom-fallback'
          ? 'Fallback lint output is not treated as a real semantic provider.'
          : 'Project-configured ESLint is unavailable. Semantic diagnostics stay off.')

      setProviderHealth('eslint', {
        status: 'degraded',
        root: eslintRoot,
        source: cleanString(result?.source) || 'project-config',
        message: failureMessage,
      })
      if (result?.reason !== 'unsupported_file' && result?.source !== 'addom-fallback') {
        logProviderFailure('eslint', failureMessage, { filePath: doc.filePath })
      }

      return {
        ok: true,
        available: false,
        diagnostics: [],
        diagnosticOwnership: createSyntaxOnlyOwnership(failureMessage),
        serviceState: buildServiceState(doc),
      }
    }

    if (isPythonLanguage(language)) {
      const provider = await ensureProviderSession('pyright', doc)
      if (!provider.ok || !provider.session) {
        return {
          ok: true,
          available: false,
          diagnostics: [],
          diagnosticOwnership: createSyntaxOnlyOwnership(
            cleanString(provider?.message || provider?.resolution?.message) || 'Pyright is unavailable.',
          ),
          serviceState: buildServiceState(doc),
        }
      }

      try {
        const diagnostics = await provider.session.requestDiagnostics(doc)
        setProviderHealth('pyright', {
          status: 'healthy',
          root: doc.projectFolder,
          source: provider.resolution.source,
          message: provider.resolution.message,
        })
        return {
          ok: true,
          available: true,
          diagnostics: Array.isArray(diagnostics) ? diagnostics.map(normalizeLspDiagnosticMessage) : [],
          diagnosticOwnership: createProviderOwnership('pyright', 'Pyright owns diagnostics for this file.'),
          serviceState: buildServiceState(doc),
        }
      } catch (error) {
        const failureMessage = cleanString(error?.message || 'Pyright diagnostics failed.')
        setProviderHealth('pyright', {
          status: 'degraded',
          root: doc.projectFolder,
          source: provider.resolution.source,
          message: failureMessage,
        })
        logProviderFailure('pyright', failureMessage, { filePath: doc.filePath })
        return {
          ok: true,
          available: false,
          diagnostics: [],
          diagnosticOwnership: createSyntaxOnlyOwnership(failureMessage),
          serviceState: buildServiceState(doc),
        }
      }
    }

    return {
      ok: true,
      available: false,
      diagnostics: [],
      diagnosticOwnership: createSyntaxOnlyOwnership('Unsupported languages stay syntax-only until a real provider ships.'),
      serviceState: buildServiceState(doc),
    }
  }



  return requestDiagnostics
}
