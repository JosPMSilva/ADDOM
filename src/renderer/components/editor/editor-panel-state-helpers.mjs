export function normalizeFsPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .trim()
}

export function normalizeEditorPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .trim()
}

const MARKDOWN_PREVIEW_RATIO_STORAGE_KEY = 'addom.editor.markdownPreview.ratio'
const MARKDOWN_PREVIEW_MIN_RATIO = 0.28
const MARKDOWN_PREVIEW_MAX_RATIO = 0.72

export function clampMarkdownPreviewRatio(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  return Math.max(MARKDOWN_PREVIEW_MIN_RATIO, Math.min(MARKDOWN_PREVIEW_MAX_RATIO, n))
}

export function readMarkdownPreviewRatio() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 0.5
    const raw = window.localStorage.getItem(MARKDOWN_PREVIEW_RATIO_STORAGE_KEY)
    if (raw == null || String(raw).trim() === '') return 0.5
    return clampMarkdownPreviewRatio(Number(raw))
  } catch {
    return 0.5
  }
}

export function writeMarkdownPreviewRatio(value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(MARKDOWN_PREVIEW_RATIO_STORAGE_KEY, String(clampMarkdownPreviewRatio(value)))
  } catch {
    // Ignore localStorage failures.
  }
}

const FILE_TREE_WIDTH_STORAGE_KEY = 'addom.editor.fileTree.width'
const FILE_TREE_MIN_WIDTH = 160
const FILE_TREE_MAX_WIDTH = 600

export function clampFileTreeWidth(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 220
  return Math.max(FILE_TREE_MIN_WIDTH, Math.min(FILE_TREE_MAX_WIDTH, n))
}

export function readFileTreeWidth() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 220
    const raw = window.localStorage.getItem(FILE_TREE_WIDTH_STORAGE_KEY)
    if (raw == null || String(raw).trim() === '') return 220
    return clampFileTreeWidth(Number(raw))
  } catch {
    return 220
  }
}

export function writeFileTreeWidth(value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(FILE_TREE_WIDTH_STORAGE_KEY, String(clampFileTreeWidth(value)))
  } catch {
    // Ignore localStorage failures.
  }
}

export function resolveStateValue(currentValue, nextValue) {
  return typeof nextValue === 'function' ? nextValue(currentValue) : nextValue
}

export const OPTIONAL_EDITOR_SERVICE_WARNING_PROVIDER_IDS = new Set([
  'biome',
  'eslint',
  'eslint-project-config',
  'clang-format',
  'clang-tidy',
  'csharpier',
  'dotnet-format',
  'ruff',
])

export function getActionableServiceNotice(serviceState = null) {
  return serviceState
}
