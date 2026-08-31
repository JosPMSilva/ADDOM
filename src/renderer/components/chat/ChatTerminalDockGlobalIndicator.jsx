import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import useAppStore from '../../store/useAppStore.js'
import useTerminalStore from '../../store/useTerminalStore.js'
import useToolStore from '../../store/useToolStore.js'
import useWorkspaceStore from '../../store/useWorkspaceStore.js'
import Icon from '../ui/Icon.jsx'
import {
  asTrimmedString,
  getPriorityClasses,
  getPriorityIcon,
} from './chat-terminal-dock-utils.mjs'

export default function ChatTerminalGlobalIndicator({ activeThreadId = '' }) {
  const { t } = useRendererTranslation(['core'])
  const [open, setOpen] = React.useState(false)
  const threads = useWorkspaceStore((state) => state.threads)
  const setActiveThread = useWorkspaceStore((state) => state.setActiveThread)
  const sessions = useTerminalStore(useShallow((state) => state.getSessions?.() || []))
  const pendingByThreadId = useToolStore((state) => state.pendingByThreadId)
  const setActivePanel = useAppStore((state) => state.setActivePanel)

  const rows = React.useMemo(() => {
    const sessionsByThreadId = new Map()
    for (const session of Array.isArray(sessions) ? sessions : []) {
      const threadId = asTrimmedString(session?.threadId)
      if (!threadId || threadId === asTrimmedString(activeThreadId)) continue
      const existing = sessionsByThreadId.get(threadId) || { liveCount: 0, priority: 'running' }
      existing.liveCount += 1
      if (asTrimmedString(session?.failureReason)) existing.priority = 'failed'
      else if (session?.pendingAiControlRequest === true && existing.priority !== 'failed') existing.priority = 'waiting'
      sessionsByThreadId.set(threadId, existing)
    }
    for (const [threadId, approvals] of Object.entries(pendingByThreadId || {})) {
      if (threadId === asTrimmedString(activeThreadId)) continue
      const pendingCount = (Array.isArray(approvals) ? approvals : []).filter((approval) => (
        asTrimmedString(approval?.toolName).toLowerCase() === 'terminal_session_open'
      )).length
      if (pendingCount <= 0) continue
      const existing = sessionsByThreadId.get(threadId) || { liveCount: 0, priority: 'running' }
      existing.liveCount += pendingCount
      existing.priority = 'approval'
      sessionsByThreadId.set(threadId, existing)
    }
    return Array.from(sessionsByThreadId.entries()).map(([threadId, row]) => ({
      threadId,
      liveCount: row.liveCount,
      priority: row.priority,
      title: Array.isArray(threads)
        ? (threads.find((thread) => asTrimmedString(thread?.id) === threadId)?.title || threadId)
        : threadId,
    }))
  }, [activeThreadId, pendingByThreadId, sessions, threads])

  if (rows.length <= 0) return null

  const topPriority = rows.some((row) => row.priority === 'approval')
    ? 'approval'
    : (rows.some((row) => row.priority === 'failed')
      ? 'failed'
      : (rows.some((row) => row.priority === 'waiting') ? 'waiting' : 'running'))

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={['inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs', getPriorityClasses(topPriority)].join(' ')}
        aria-expanded={open ? 'true' : 'false'}
        aria-haspopup="dialog"
        data-ui="chat-terminal-global-indicator"
      >
        <span className="font-mono">&gt;_</span>
        <span>
          {t('core:terminal.globalIndicator.threadCount', {
            defaultValue: '{{count}} thread{{suffix}}',
            count: rows.length,
            suffix: rows.length === 1 ? '' : 's',
          })}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-80 rounded-2xl border border-surface-border bg-surface-panel-muted-strong/95 p-3 shadow-[0_24px_54px_rgb(var(--theme-cool-shadow-rgb)_/_0.36)] backdrop-blur">
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.threadId} className="rounded-2xl border border-surface-border bg-surface-panel/60 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{row.title}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {t('core:terminal.globalIndicator.liveCount', {
                        defaultValue: '{{count}} live terminal{{suffix}}',
                        count: row.liveCount,
                        suffix: row.liveCount === 1 ? '' : 's',
                      })}
                    </p>
                  </div>
                  <span className={['flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]', getPriorityClasses(row.priority)].join(' ')}>
                    <Icon name={getPriorityIcon(row.priority)} className="text-[11px]" />
                    {row.priority === 'approval'
                      ? t('core:terminal.globalIndicator.priority.approval', { defaultValue: 'Approval needed' })
                      : (row.priority === 'failed'
                          ? t('core:terminal.common.status.failed', { defaultValue: 'Failed' })
                          : (row.priority === 'waiting'
                              ? t('core:terminal.globalIndicator.priority.waiting', { defaultValue: 'Waiting for user' })
                              : t('core:terminal.dock.state.running', { defaultValue: 'Running' })))}
                  </span>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveThread?.(row.threadId)
                      setActivePanel?.('chat')
                      setOpen(false)
                    }}
                    className="rounded-full border border-surface-border px-3 py-1.5 text-xs text-text-secondary hover:border-border-hover hover:text-text-primary"
                  >
                    {t('core:terminal.dock.browser.actions.openThread', { defaultValue: 'Open thread' })}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
