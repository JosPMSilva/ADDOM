import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RENDERER_ROOT = path.resolve('src/renderer')
const BROWSER_SHARED_CAPABILITY_FILES = [
  path.resolve('src/main/api-clients/openai-api-capability-contract.mjs'),
]
const EXPECTED_TOOL_CAPABILITY_FILES = new Set([
  path.resolve('src/renderer/components/chat/ChatHeaderControls.jsx'),
  path.resolve('src/renderer/components/chat/provider-model-selector-view-model.mjs'),
])
const EXPECTED_PROVIDER_RUNTIME_FILES = new Set([
  path.resolve('src/renderer/components/chat/ChatHeaderControls.jsx'),
  path.resolve('src/renderer/components/chat/provider-model-selector-view-model.mjs'),
])

function listFilesRecursive(rootDir) {
  const files = []
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath))
      continue
    }
    files.push(fullPath)
  }
  return files
}

function findRendererFilesMatching(pattern) {
  return listFilesRecursive(RENDERER_ROOT)
    .filter((filePath) => /\.(jsx|js|mjs)$/.test(filePath))
    .filter((filePath) => pattern.test(fs.readFileSync(filePath, 'utf8')))
}

test('renderer capability presentation stays scoped to the selector runtime-aware surfaces', () => {
  const supportsToolsFiles = findRendererFilesMatching(/\bsupportsTools\b/)
  const supportsAnyToolSurfaceFiles = findRendererFilesMatching(/\bsupportsAnyToolSurface\b/)
  const providerRuntimeFiles = findRendererFilesMatching(/\bproviderNativeRuntime(?:Mode|Family)\b/)

  assert.deepEqual(new Set(supportsToolsFiles), EXPECTED_TOOL_CAPABILITY_FILES)
  assert.deepEqual(new Set(supportsAnyToolSurfaceFiles), EXPECTED_TOOL_CAPABILITY_FILES)
  assert.deepEqual(new Set(providerRuntimeFiles), EXPECTED_PROVIDER_RUNTIME_FILES)
})

test('renderer no longer ships stale generic tool-capable wording', () => {
  const staleWordingFiles = findRendererFilesMatching(/Tool-capable only/)
  assert.deepEqual(staleWordingFiles, [])
})

test('renderer-transitive capability contracts do not import Node or provider runtimes', () => {
  for (const filePath of BROWSER_SHARED_CAPABILITY_FILES) {
    const source = fs.readFileSync(filePath, 'utf8')
    assert.doesNotMatch(source, /\bfrom\s+['"]node:/)
    assert.doesNotMatch(source, /\bfrom\s+['"]@ai-sdk\//)
  }
})
