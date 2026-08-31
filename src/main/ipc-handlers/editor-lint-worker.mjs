import { parentPort } from 'worker_threads'
import path from 'path'

const MAX_LINT_TEXT_CHARS = 200_000
const LINTABLE_EXTS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])
const MAX_ESLINT_INSTANCE_CACHE_SIZE = 20

let eslintModulePromise = null
const eslintInstanceCache = new Map()
let eslintLintInFlight = false

function assertTestOnlyEditorLintWorkerAccess() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test-only editor lint worker helper called in non-test environment.')
  }
  if (!process.env.ADDOM_USER_DATA_PATH && process.env.NODE_ENV !== 'test') {
    throw new Error('Test-only editor lint worker helper requires a test user-data path.')
  }
}

function safePath(projectRoot, filePath) {
  const abs = path.resolve(projectRoot, filePath)
  const rel = path.relative(projectRoot, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${filePath}" escapes the project root.`)
  }
  return abs
}

function getImportDefault(mod) {
  return mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod
}

function isLintableFile(filePath = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return LINTABLE_EXTS.has(ext)
}

function isTsLikeFile(filePath = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return ext === '.ts' || ext === '.tsx'
}

function isReactLikeFile(filePath = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return ext === '.jsx' || ext === '.tsx'
}

async function loadEslintDeps() {
  if (eslintModulePromise) return eslintModulePromise

  eslintModulePromise = (async () => {
    try {
      const eslintMod = await import('eslint')
      const core = getImportDefault(eslintMod)
      const ESLint = core?.ESLint || eslintMod?.ESLint
      if (!ESLint) {
        return { available: false, reason: 'eslint_api_missing', message: 'ESLint package loaded but ESLint class was not found.' }
      }

      let js = null
      let globals = null
      let tsParser = null
      let tsPlugin = null
      let reactPlugin = null
      let reactHooksPlugin = null

      try { js = getImportDefault(await import('@eslint/js')) } catch { /* optional ESLint preset */ }
      try { globals = getImportDefault(await import('globals')) } catch { /* optional globals package */ }
      try { tsParser = getImportDefault(await import('@typescript-eslint/parser')) } catch { /* optional TypeScript parser */ }
      try { tsPlugin = getImportDefault(await import('@typescript-eslint/eslint-plugin')) } catch { /* optional TypeScript plugin */ }
      try { reactPlugin = getImportDefault(await import('eslint-plugin-react')) } catch { /* optional React plugin */ }
      try { reactHooksPlugin = getImportDefault(await import('eslint-plugin-react-hooks')) } catch { /* optional React Hooks plugin */ }

      return {
        available: true,
        ESLint,
        js,
        globals,
        tsParser,
        tsPlugin,
        reactPlugin,
        reactHooksPlugin,
      }
    } catch (err) {
      return {
        available: false,
        reason: 'eslint_not_installed',
        message: String(err?.message || 'Failed to load eslint'),
      }
    }
  })()

  return eslintModulePromise
}

function mergeRuleSets(...sets) {
  const out = {}
  for (const set of sets) {
    if (!set || typeof set !== 'object') continue
    for (const [key, value] of Object.entries(set)) {
      out[key] = value
    }
  }
  return out
}

function buildFallbackFlatConfig(deps, fileAbs) {
  const isTs = isTsLikeFile(fileAbs)
  const isReact = isReactLikeFile(fileAbs)
  const globalsLib = deps.globals && typeof deps.globals === 'object' ? deps.globals : {}
  const browserGlobals = globalsLib.browser && typeof globalsLib.browser === 'object' ? globalsLib.browser : {}
  const nodeGlobals = globalsLib.node && typeof globalsLib.node === 'object' ? globalsLib.node : {}
  const commonGlobals = { ...browserGlobals, ...nodeGlobals }
  const ecmaVersion = 'latest'

  const configs = []
  if (deps.js?.configs?.recommended) {
    configs.push(deps.js.configs.recommended)
  }

  if (isTs && !deps.tsParser) {
    return null
  }

  const plugins = {}
  if (deps.tsPlugin && isTs) plugins['@typescript-eslint'] = deps.tsPlugin
  if (deps.reactPlugin && isReact) plugins.react = deps.reactPlugin
  if (deps.reactHooksPlugin && isReact) plugins['react-hooks'] = deps.reactHooksPlugin

  const tsRecommendedRules = deps.tsPlugin?.configs?.recommended?.rules || null
  const reactRecommendedRules = deps.reactPlugin?.configs?.recommended?.rules || null
  const reactJsxRuntimeRules = deps.reactPlugin?.configs?.['jsx-runtime']?.rules || null
  const reactHooksRecommendedRules = deps.reactHooksPlugin?.configs?.recommended?.rules || null

  const projectRuleOverrides = {
    'no-console': 'warn',
    'no-debugger': 'warn',
    'no-var': 'warn',
    eqeqeq: ['warn', 'always'],
  }

  configs.push({
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion,
      sourceType: 'module',
      globals: commonGlobals,
      ...(isTs
        ? {
            parser: deps.tsParser,
            parserOptions: {
              ecmaVersion,
              sourceType: 'module',
              ecmaFeatures: { jsx: isReact },
            },
          }
        : {
            parserOptions: {
              ecmaVersion,
              sourceType: 'module',
              ecmaFeatures: { jsx: isReact },
            },
          }),
    },
    plugins,
    ...(isReact ? { settings: { react: { version: 'detect' } } } : {}),
    rules: mergeRuleSets(
      isTs ? tsRecommendedRules : null,
      isReact ? reactRecommendedRules : null,
      isReact ? reactJsxRuntimeRules : null,
      isReact ? reactHooksRecommendedRules : null,
      projectRuleOverrides,
    ),
  })

  return configs
}

function mapEslintMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((m) => ({
    ruleId: String(m.ruleId || '').trim(),
    message: String(m.message || '').trim(),
    severity: Number(m.severity || 1) || 1,
    fatal: !!m.fatal,
    line: Math.max(1, Number(m.line || 1) || 1),
    column: Math.max(1, Number(m.column || 1) || 1),
    endLine: Math.max(1, Number(m.endLine || m.line || 1) || 1),
    endColumn: Math.max(1, Number(m.endColumn || (Number(m.column || 1) + 1)) || 1),
    source: String(m.source || '').trim(),
    suggestionCount: Array.isArray(m.suggestions) ? m.suggestions.length : 0,
    hasFix: !!m.fix,
  }))
}

function noConfigError(err) {
  const msg = String(err?.message || '').toLowerCase()
  return msg.includes('could not find config file')
    || msg.includes('no eslint configuration found')
    || msg.includes('couldn\'t find the config')
}

function evictOldestCachedEslint() {
  while (eslintInstanceCache.size > MAX_ESLINT_INSTANCE_CACHE_SIZE) {
    const oldestCacheKey = eslintInstanceCache.keys().next().value
    if (!oldestCacheKey) break
    eslintInstanceCache.delete(oldestCacheKey)
  }
}

function getCachedEslint(cacheKey, createFactory) {
  if (eslintInstanceCache.has(cacheKey)) {
    const cached = eslintInstanceCache.get(cacheKey)
    eslintInstanceCache.delete(cacheKey)
    eslintInstanceCache.set(cacheKey, cached)
    return cached
  }
  const created = createFactory()
  eslintInstanceCache.set(cacheKey, created)
  evictOldestCachedEslint()
  return created
}

async function runLintOrFixTextWithEngine({ project, filePath, content, fix = false }) {
  const projectRoot = String(project || '').trim()
  const relFilePath = String(filePath || '').trim()
  const text = String(content ?? '')
  if (!projectRoot || !relFilePath) {
    return { ok: false, error: 'project and filePath are required.' }
  }
  if (!isLintableFile(relFilePath)) {
    return { ok: true, available: false, reason: 'unsupported_file', messages: [] }
  }
  if (text.length > MAX_LINT_TEXT_CHARS) {
    return { ok: true, available: false, reason: 'file_too_large', messages: [] }
  }

  let absPath = ''
  try {
    absPath = safePath(projectRoot, relFilePath)
  } catch (err) {
    return { ok: false, error: String(err?.message || 'Invalid path') }
  }

  const deps = await loadEslintDeps()
  if (!deps.available) {
    return { ok: true, available: false, reason: deps.reason || 'eslint_unavailable', message: deps.message || '' }
  }

  if (eslintLintInFlight) {
    return {
      ok: true,
      available: false,
      reason: 'engine_busy',
      message: 'ESLint engine busy; retry on next idle.',
    }
  }

  eslintLintInFlight = true
  try {
    try {
      const projectEslint = getCachedEslint(
        `${fix ? 'project-fix' : 'project'}:${projectRoot}`,
        () => new deps.ESLint({ cwd: projectRoot, ...(fix ? { fix: true } : {}) }),
      )
      const [result] = await projectEslint.lintText(text, { filePath: absPath, warnIgnored: false })
      const output = typeof result?.output === 'string' ? result.output : text
      return {
        ok: true,
        available: true,
        source: 'project-config',
        messages: mapEslintMessages(result?.messages || []),
        ...(fix ? { fixedContent: output, changed: output !== text } : {}),
        ignored: !!result?.suppressedMessages?.length && !(result?.messages?.length),
      }
    } catch (err) {
      if (!noConfigError(err)) {
        return {
          ok: true,
          available: false,
          reason: 'eslint_runtime_error',
          message: String(err?.message || 'ESLint failed'),
        }
      }
    }

    const fallbackConfig = buildFallbackFlatConfig(deps, absPath)
    if (!fallbackConfig) {
      return {
        ok: true,
        available: false,
        reason: 'fallback_config_unavailable',
        message: isTsLikeFile(absPath)
          ? 'Install @typescript-eslint/parser to lint TypeScript files.'
          : 'ESLint fallback config unavailable.',
      }
    }

    try {
      const fallbackKey = `fallback:${projectRoot}:${isTsLikeFile(absPath) ? 'ts' : 'js'}:${isReactLikeFile(absPath) ? 'react' : 'plain'}`
      const fallbackEslint = getCachedEslint(
        `${fix ? 'fix:' : ''}${fallbackKey}`,
        () => new deps.ESLint({
          cwd: projectRoot,
          ...(fix ? { fix: true } : {}),
          overrideConfigFile: true,
          overrideConfig: fallbackConfig,
        }),
      )
      const [result] = await fallbackEslint.lintText(text, { filePath: absPath, warnIgnored: false })
      const output = typeof result?.output === 'string' ? result.output : text
      return {
        ok: true,
        available: true,
        source: 'addom-fallback',
        messages: mapEslintMessages(result?.messages || []),
        ...(fix ? { fixedContent: output, changed: output !== text } : {}),
      }
    } catch (err) {
      return {
        ok: true,
        available: false,
        reason: 'fallback_lint_failed',
        message: String(err?.message || 'Fallback ESLint lint failed'),
      }
    }
  } finally {
    eslintLintInFlight = false
  }
}

async function lintTextWithEngine(payload) {
  return runLintOrFixTextWithEngine({ ...(payload || {}), fix: false })
}

async function fixTextWithEngine(payload) {
  return runLintOrFixTextWithEngine({ ...(payload || {}), fix: true })
}

export const __testEditorLintWorkerInternals = Object.freeze({
  lintTextWithEngine: async (...args) => {
    assertTestOnlyEditorLintWorkerAccess()
    return lintTextWithEngine(...args)
  },
  fixTextWithEngine: async (...args) => {
    assertTestOnlyEditorLintWorkerAccess()
    return fixTextWithEngine(...args)
  },
  clearEslintCache: () => {
    assertTestOnlyEditorLintWorkerAccess()
    eslintInstanceCache.clear()
  },
  getEslintCacheSize: () => {
    assertTestOnlyEditorLintWorkerAccess()
    return eslintInstanceCache.size
  },
})

async function handleWorkerRequest(message = {}) {
  const id = Number(message?.id || 0)
  const op = String(message?.op || '')
  const payload = message?.payload || {}

  if (!id || !parentPort) return

  try {
    let result
    if (op === 'lint') {
      result = await lintTextWithEngine(payload)
    } else if (op === 'fix') {
      result = await fixTextWithEngine(payload)
    } else {
      result = { ok: false, error: `Unknown editor-lint worker op: ${op}` }
    }
    parentPort.postMessage({ id, ok: true, result })
  } catch (err) {
    parentPort.postMessage({
      id,
      ok: false,
      error: String(err?.message || err || 'Worker request failed'),
    })
  }
}

if (parentPort) {
  parentPort.on('message', (message) => {
    void handleWorkerRequest(message)
  })
}
