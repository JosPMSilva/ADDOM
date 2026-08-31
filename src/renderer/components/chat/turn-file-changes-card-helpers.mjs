import hljs from 'highlight.js/lib/common'
import i18n from '../../i18n/init.mjs'
import { createRendererTranslator } from '../../i18n/index.mjs'

function getRendererTranslator() {
  return createRendererTranslator({
    locale: i18n?.resolvedLanguage || i18n?.language || 'en',
    namespaces: ['core'],
  })
}

export function basenameFromPath(filePath = '') {
  const clean = String(filePath || '').trim().replace(/\\/g, '/')
  const base = clean.split('/').pop() || clean
  return base
}

export function extensionFromPath(filePath = '') {
  const base = basenameFromPath(filePath)
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : ''
  return ext || '(none)'
}

export function inferCodeLanguageFromPath(filePath = '') {
  const ext = extensionFromPath(filePath).replace(/^\./, '')
  const map = {
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    java: 'java',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    php: 'php',
    sh: 'bash',
    zsh: 'bash',
    ps1: 'powershell',
    html: 'xml',
    htm: 'xml',
    xml: 'xml',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    toml: 'ini',
    ini: 'ini',
  }
  return map[ext] || 'text'
}

export function highlightCode(content = '', language = 'text') {
  const text = String(content ?? '')
  const preferred = String(language || 'text').trim().toLowerCase()
  try {
    if (preferred && hljs.getLanguage(preferred)) {
      return hljs.highlight(text, { language: preferred, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(text).value
  } catch {
    return ''
  }
}

export function changeTypeLabel(changeType = '') {
  const t = getRendererTranslator()
  const value = String(changeType || '').trim().toLowerCase()
  if (value === 'applied') return t('chat.fileChanges.changeType.applied', { defaultValue: 'Applied' })
  if (value === 'modified') return t('chat.fileChanges.changeType.modified', { defaultValue: 'Modified' })
  if (value === 'edited') return t('chat.fileChanges.changeType.edited', { defaultValue: 'Edited' })
  if (value === 'deleted') return t('chat.fileChanges.changeType.deleted', { defaultValue: 'Deleted' })
  if (value === 'renamed') return t('chat.fileChanges.changeType.renamed', { defaultValue: 'Renamed' })
  if (value === 'rolled_back') return t('chat.fileChanges.changeType.rolledBack', { defaultValue: 'Rolled Back' })
  return t('chat.fileChanges.changeType.created', { defaultValue: 'Created' })
}

function normalizedRowChangeType(row = {}) {
  return String(row?.fileChange?.changeType || '').trim().toLowerCase()
}

export function isCreatedFileChange(row = {}) {
  return normalizedRowChangeType(row) === 'created'
}

export function isUndoableFileChange(row = {}) {
  if (isCreatedFileChange(row)) return false
  return !!String(row?.fileChange?.prevRevId || '').trim()
}

export function isDeletableCreatedFileChange(row = {}) {
  if (!isCreatedFileChange(row)) return false
  return !!String(row?.fileChange?.newRevId || '').trim()
}

export function deriveRowSyncStatus(row = {}, latest = null, options = {}) {
  const t = getRendererTranslator()
  const current = latest && typeof latest === 'object' ? latest : null
  const rowNewRevId = String(row?.fileChange?.newRevId || '').trim()
  const latestId = String(current?.latestId || '').trim()
  const latestSource = String(current?.latestSource || '').trim().toLowerCase()
  const latestPrevRevId = String(current?.latestPrevRevId || '').trim()
  const latestContentLength = Math.max(0, Number(current?.latestContentLength || 0) || 0)
  const turnState = String(options?.turnState || '').trim().toLowerCase()

  if (!rowNewRevId) {
    if (turnState === 'cancelled') {
      return {
        kind: 'discarded',
        label: t('chat.fileChanges.syncStatus.discardedDraft', { defaultValue: 'discarded draft' }),
        toneClass: 'text-warning-soft',
      }
    }
    return {
      kind: 'untracked',
      label: t('chat.fileChanges.syncStatus.draftUntracked', { defaultValue: 'draft/untracked' }),
      toneClass: 'text-warning-soft',
    }
  }
  if (!latestId || latestId === rowNewRevId) {
    return {
      kind: 'active',
      label: t('chat.fileChanges.syncStatus.applied', { defaultValue: 'applied' }),
      toneClass: 'text-success',
    }
  }

  const resolvedByManualRollback = latestSource === 'manual_rollback' && latestPrevRevId === rowNewRevId
  if (resolvedByManualRollback) {
    if (isCreatedFileChange(row) && latestContentLength === 0) {
      return {
        kind: 'deleted',
        label: t('chat.fileChanges.syncStatus.deleted', { defaultValue: 'deleted' }),
        toneClass: 'text-danger-soft',
      }
    }
    return {
      kind: 'undone',
      label: t('chat.fileChanges.syncStatus.undone', { defaultValue: 'undone' }),
      toneClass: 'text-warning-soft',
    }
  }

  return {
    kind: 'conflict',
    label: t('chat.fileChanges.syncStatus.conflict', { defaultValue: 'conflict' }),
    toneClass: 'text-danger-soft',
  }
}

const MAX_FILE_PREVIEW_LINES = 20_000
const MAX_FILE_PREVIEW_BYTES = 1_500_000

function countTextLines(text = '') {
  const value = String(text ?? '')
  if (!value) return 0
  let lineCount = 1
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) lineCount += 1
  }
  return lineCount
}

export function previewLimitMessage({ lineCount = 0 } = {}) {
  const t = getRendererTranslator()
  const normalizedLineCount = Math.max(0, Number(lineCount || 0) || 0)
  if (normalizedLineCount > 0) {
    return t('chat.fileChanges.preview.limitWithLineCount', {
      defaultValue: 'File size exceeds preview limits ({{lineCount}} lines). Open in editor or [[canon:artifacts]] to inspect changes.',
      lineCount: normalizedLineCount.toLocaleString(),
    })
  }
  return t('chat.fileChanges.preview.limitNoLineCount', {
    defaultValue: 'File size exceeds preview limits. Preview is disabled above {{maxLines}} lines.',
    maxLines: MAX_FILE_PREVIEW_LINES.toLocaleString(),
  })
}

export function isLikelyOversizedForPreview(row = {}) {
  const contentBytes = Number(row?.fileChange?.contentBytes || 0) || 0
  return contentBytes > MAX_FILE_PREVIEW_BYTES
}

export function getPreviewLimitState(beforeText = '', afterText = '') {
  const beforeLineCount = countTextLines(beforeText)
  const afterLineCount = countTextLines(afterText)
  const maxLineCount = Math.max(beforeLineCount, afterLineCount)
  if (maxLineCount > MAX_FILE_PREVIEW_LINES) {
    return {
      blocked: true,
      lineCount: maxLineCount,
      message: previewLimitMessage({ lineCount: maxLineCount }),
    }
  }
  return {
    blocked: false,
    lineCount: maxLineCount,
    message: '',
  }
}

export function rowKeyFromEntry(row = {}) {
  return String(row?.key || row?.fileChange?.filePath || '').trim()
}

export function rowRevisionId(row = {}) {
  return String(row?.fileChange?.newRevId || '').trim()
}

export function rowSignature(row = {}) {
  const key = rowKeyFromEntry(row)
  const newRevId = String(row?.fileChange?.newRevId || '').trim()
  const prevRevId = String(row?.fileChange?.prevRevId || '').trim()
  const filePath = String(row?.fileChange?.filePath || '').trim()
  const changeType = String(row?.fileChange?.changeType || '').trim().toLowerCase()
  const addedLines = Number(row?.fileChange?.addedLines || 0) || 0
  const removedLines = Number(row?.fileChange?.removedLines || 0) || 0
  const diffText = String(row?.fileChange?.diffText || '')
  return [key, filePath, newRevId, prevRevId, changeType, addedLines, removedLines, diffText.length].join('|')
}

export function liveRowStateMapEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    const a = left[key] && typeof left[key] === 'object' ? left[key] : {}
    const b = right[key] && typeof right[key] === 'object' ? right[key] : {}
    if (a.isLive !== b.isLive) return false
    if (a.revisionId !== b.revisionId) return false
    if (a.diffReady !== b.diffReady) return false
    if (a.diffFailed !== b.diffFailed) return false
    if (Number(a.lastUpdatedAt || 0) !== Number(b.lastUpdatedAt || 0)) return false
  }
  return true
}
