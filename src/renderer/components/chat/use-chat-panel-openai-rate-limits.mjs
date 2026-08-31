import { useCallback, useEffect, useRef } from 'react'

const OPENAI_ACCOUNT_RATE_LIMIT_POLL_INTERVAL_MS = 2_000

export function useChatPanelOpenAIRateLimits({
  activeProjectId,
  activeThreadId,
  isStreaming,
  openAIAccountHasSession,
  projectFolder,
  refreshOpenAIAccountState,
  selectedProvider,
  selectedProviderAuthMethod,
}) {
  const openAIAccountRateLimitScopeRef = useRef('')
  const shouldTrackOpenAIAccountRateLimits = (
    String(selectedProvider || '').trim().toLowerCase() === 'openai'
    && selectedProviderAuthMethod === 'account'
    && openAIAccountHasSession
  )
  const refreshOpenAIAccountRateLimits = useCallback(async ({
    refreshProviders = false,
    background = true,
  } = {}) => {
    if (!shouldTrackOpenAIAccountRateLimits) return null
    try {
      return await refreshOpenAIAccountState({ refreshProviders, background })
    } catch {
      return null
    }
  }, [refreshOpenAIAccountState, shouldTrackOpenAIAccountRateLimits])

  useEffect(() => {
    if (!shouldTrackOpenAIAccountRateLimits) {
      openAIAccountRateLimitScopeRef.current = ''
      return
    }
    const scopeKey = [
      String(activeThreadId || '').trim(),
      String(activeProjectId || '').trim(),
      String(projectFolder || '').trim(),
    ].join('::')
    if (!scopeKey.replace(/::/g, '')) return
    if (openAIAccountRateLimitScopeRef.current === scopeKey) return
    openAIAccountRateLimitScopeRef.current = scopeKey
    void refreshOpenAIAccountRateLimits({ refreshProviders: false, background: true })
  }, [
    activeProjectId,
    activeThreadId,
    projectFolder,
    refreshOpenAIAccountRateLimits,
    shouldTrackOpenAIAccountRateLimits,
  ])

  useEffect(() => {
    if (!shouldTrackOpenAIAccountRateLimits || !isStreaming) return undefined
    void refreshOpenAIAccountRateLimits({ refreshProviders: false, background: true })
    const intervalId = window.setInterval(() => {
      void refreshOpenAIAccountRateLimits({ refreshProviders: false, background: true })
    }, OPENAI_ACCOUNT_RATE_LIMIT_POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [isStreaming, refreshOpenAIAccountRateLimits, shouldTrackOpenAIAccountRateLimits])

  return {
    refreshOpenAIAccountRateLimits,
    shouldTrackOpenAIAccountRateLimits,
  }
}
