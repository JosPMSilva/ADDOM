import React from 'react'
import useChatStore from '../../store/useChatStore.js'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ModeToggle from './ModeToggle.jsx'

function normalizeChatMode(mode = 'execute') {
  return mode === 'plan' || mode === 'thinking' ? mode : 'execute'
}

function getModeTip(t, mode = 'execute') {
  if (mode === 'plan') {
    return t('core:chat.permissionMode.planActive', { defaultValue: 'Plan mode: research and plan tools are available; project changes are blocked.' })
  }
  if (mode === 'thinking') {
    return t('core:chat.permissionMode.thinkingActive', { defaultValue: 'Thinking mode: read and research tools are available; project changes are blocked.' })
  }
  return ''
}

export function ChatModeToggleController({ executeOnly = false, disabled = false }) {
  const chatMode = useChatStore((s) => s.chatMode)
  const setChatMode = useChatStore((s) => s.setChatMode)
  const [displayMode, setDisplayMode] = React.useState(() => normalizeChatMode(chatMode))
  const persistTimerRef = React.useRef(0)

  const persistMode = React.useCallback((nextMode) => {
    if (typeof window === 'undefined') return
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = 0
      window.addom?.settings?.set?.({ chatMode: nextMode }).catch(() => {})
    }, 120)
  }, [])

  React.useEffect(() => () => {
    if (typeof window === 'undefined') return
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
  }, [])

  React.useEffect(() => {
    setDisplayMode(normalizeChatMode(chatMode))
  }, [chatMode])

  const handleModeChange = React.useCallback((mode) => {
    if (disabled) return
    const nextMode = normalizeChatMode(mode)
    setDisplayMode(nextMode)
    setChatMode(nextMode)
    persistMode(nextMode)
  }, [disabled, persistMode, setChatMode])

  return (
    <ModeToggle
      mode={displayMode}
      onChange={handleModeChange}
      executeOnly={executeOnly}
      disabled={disabled}
    />
  )
}

export function ChatModeFooterTip() {
  const { t } = useRendererTranslation(['core'])
  const chatMode = useChatStore((s) => s.chatMode)
  const tip = getModeTip(t, normalizeChatMode(chatMode))

  return (
    <div className="h-6 pt-1 px-3 text-center text-xs text-text-secondary pointer-events-none" data-ui="chat-mode-footer-tip">
      <span className={`mx-auto block max-w-full truncate ${tip ? 'opacity-100' : 'opacity-0'}`}>{tip || '\u00a0'}</span>
    </div>
  )
}
