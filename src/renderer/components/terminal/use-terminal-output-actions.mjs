import { useCallback } from 'react'
import useAppStore from '../../store/useAppStore.js'
import useTerminalStore from '../../store/useTerminalStore.js'
import {
  TERMINAL_CHAT_OUTPUT_MAX_CHARS,
  TERMINAL_ERROR_OUTPUT_MAX_CHARS,
  TERMINAL_MEMORY_OUTPUT_MAX_CHARS,
  TERMINAL_SUMMARY_OUTPUT_MAX_CHARS,
  buildTerminalChatDraftInjection,
  extractTerminalOutputContext,
} from './terminal-output-context.mjs'

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

const ACTION_LIMITS = Object.freeze({
  send: TERMINAL_CHAT_OUTPUT_MAX_CHARS,
  explain_error: TERMINAL_ERROR_OUTPUT_MAX_CHARS,
  summarize_session: TERMINAL_SUMMARY_OUTPUT_MAX_CHARS,
  save_memory: TERMINAL_MEMORY_OUTPUT_MAX_CHARS,
})

const ACTION_MODES = Object.freeze({
  send: 'selected_or_visible',
  explain_error: 'recent_tail',
  summarize_session: 'full_bounded',
  save_memory: 'full_bounded',
})

function getActionKey(action = '') {
  const normalized = asTrimmedString(action).toLowerCase()
  if (normalized === 'explain_error' || normalized === 'summarize_session' || normalized === 'save_memory') return normalized
  return 'send'
}

export function useTerminalOutputActions({
  session = null,
  rawOutput = '',
  projectFolder = '',
} = {}) {
  const queueChatDraftInjection = useAppStore((state) => state.queueChatDraftInjection)
  const setActivePanel = useAppStore((state) => state.setActivePanel)
  const saveLiveSessionSnapshotToMemory = useTerminalStore((state) => state.saveLiveSessionSnapshotToMemory)
  const memoryPending = useTerminalStore((state) => (
    state.liveMemoryActionPendingBySessionId?.[asTrimmedString(session?.id || session?.sessionId)] === true
  ))

  const buildOutput = useCallback((action, snapshot = {}) => {
    const actionKey = getActionKey(action)
    if (asTrimmedString(snapshot?.text)) {
      return {
        text: asTrimmedString(snapshot.text),
        truncated: snapshot.truncated === true,
        maxChars: Number(snapshot.maxChars || ACTION_LIMITS[actionKey]) || ACTION_LIMITS[actionKey],
        originalCharCount: Number(snapshot.originalCharCount || String(snapshot.text || '').length) || String(snapshot.text || '').length,
        sourceMode: asTrimmedString(snapshot.sourceMode || snapshot.mode || ACTION_MODES[actionKey]),
      }
    }
    return extractTerminalOutputContext({
      mode: snapshot.mode || ACTION_MODES[actionKey],
      selectedText: snapshot.selectedText,
      visibleText: snapshot.visibleText,
      fullScrollbackText: snapshot.fullScrollbackText,
      rawOutput: snapshot.rawOutput ?? rawOutput,
      maxChars: ACTION_LIMITS[actionKey],
    })
  }, [rawOutput])

  const queueChatAction = useCallback((action, snapshot = {}) => {
    const actionKey = getActionKey(action)
    const output = buildOutput(actionKey, snapshot)
    const draft = buildTerminalChatDraftInjection({
      action: actionKey,
      session,
      output,
    })
    if (!draft) return false
    queueChatDraftInjection?.(draft)
    setActivePanel?.('chat')
    return true
  }, [buildOutput, queueChatDraftInjection, session, setActivePanel])

  const saveSnapshotToMemory = useCallback(async (snapshot = {}, options = {}) => {
    const output = buildOutput('save_memory', snapshot)
    if (!output.text) return null
    return saveLiveSessionSnapshotToMemory?.(session?.id || session?.sessionId, {
      projectFolder,
      rawOutput: snapshot.rawOutput ?? rawOutput,
      output,
      targetScope: options.targetScope || 'thread',
    })
  }, [buildOutput, projectFolder, rawOutput, saveLiveSessionSnapshotToMemory, session])

  return {
    memoryPending,
    sendOutputToChat: (snapshot = {}) => queueChatAction('send', snapshot),
    explainLastError: (snapshot = {}) => queueChatAction('explain_error', snapshot),
    summarizeSession: (snapshot = {}) => queueChatAction('summarize_session', snapshot),
    saveSnapshotToMemory,
  }
}
