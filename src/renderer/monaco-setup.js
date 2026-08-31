/**
 * monaco-setup.js
 *
 * Configures Monaco Editor to use self-contained ESM workers bundled by Vite,
 * bypassing the CDN AMD loader entirely. This is required when a Content Security
 * Policy blocks external scripts (which is always the case in ADDOM's Electron app).
 *
 * Must be imported ONCE before any @monaco-editor/react component renders.
 * App.jsx imports this at the top level.
 *
 * How it works:
 *   1. Import the full monaco-editor ESM package — Vite bundles it locally.
 *   2. Set window.MonacoEnvironment.getWorker() to return the correct Web Worker
 *      for each language service. Workers are also bundled by Vite as separate
 *      chunks via ?worker imports.
 *   3. Call loader.config({ monaco }) so @monaco-editor/react skips its CDN fetch
 *      and uses our pre-loaded instance.
 */

import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'

import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'

function configureDiagnostics(monacoInstance) {
  try {
    const ts = monacoInstance?.languages?.typescript
    if (ts?.javascriptDefaults && ts?.typescriptDefaults) {
      const commonCompiler = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        noEmit: true,
      }

      const diagnosticsOptions = {
        noSemanticValidation: false,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: false,
      }

      ts.javascriptDefaults.setEagerModelSync(true)
      ts.typescriptDefaults.setEagerModelSync(true)
      ts.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
      ts.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)

      ts.javascriptDefaults.setCompilerOptions({
        ...commonCompiler,
        allowJs: true,
        checkJs: true,
        jsx: ts.JsxEmit.ReactJSX,
      })

      ts.typescriptDefaults.setCompilerOptions({
        ...commonCompiler,
        allowJs: false,
        checkJs: false,
        jsx: ts.JsxEmit.ReactJSX,
      })
    }
  } catch {
    // Keep editor usable if Monaco changes an API shape.
  }

  try {
    const json = monacoInstance?.languages?.json?.jsonDefaults
    if (json?.setDiagnosticsOptions) {
      json.setDiagnosticsOptions({
        validate: true,
        allowComments: true,
        enableSchemaRequest: false,
      })
    }
  } catch {
    // JSON worker is optional for editor startup resilience.
  }
}

export async function ensureMonacoLanguage() {
  return monaco
}

window.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })
configureDiagnostics(monaco)
loader.init().catch(() => {})
