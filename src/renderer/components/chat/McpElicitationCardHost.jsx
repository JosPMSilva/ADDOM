import React from 'react'
import McpElicitationCard from './McpElicitationCard.jsx'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function McpElicitationCardHost({
  activeThreadId = '',
}) {
  const { t } = useRendererTranslation(['core'])
  const [request, setRequest] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const threadId = String(activeThreadId || '').trim()
    const chatApi = window?.addom?.chat
    setRequest(null)
    setError('')
    if (!threadId || typeof chatApi?.getPendingMcpElicitation !== 'function') return undefined

    let disposed = false
    void chatApi.getPendingMcpElicitation(threadId)
      .then((pending) => {
        if (!disposed) setRequest(pending || null)
      })
      .catch(() => {})

    const unsubscribeRequested = chatApi.onMcpElicitationRequested?.((payload = {}) => {
      if (disposed || String(payload.threadId || '').trim() !== threadId) return
      setError('')
      setRequest(payload.elicitation || null)
    })
    const unsubscribeCleared = chatApi.onMcpElicitationCleared?.((payload = {}) => {
      if (disposed || String(payload.threadId || '').trim() !== threadId) return
      setError('')
      setRequest(null)
    })
    return () => {
      disposed = true
      unsubscribeRequested?.()
      unsubscribeCleared?.()
    }
  }, [activeThreadId])

  if (!request) return null
  return (
    <McpElicitationCard
      request={request}
      error={error}
      onRespond={async (action, content) => {
        setError('')
        setRequest((current) => current ? { ...current, responsePending: true } : current)
        try {
          await window.addom.chat.respondMcpElicitation({
            threadId: activeThreadId,
            action,
            content,
          })
          setRequest(null)
        } catch (responseError) {
          setRequest((current) => current ? { ...current, responsePending: false } : current)
          setError(String(responseError?.message || t('core:chat.mcpElicitation.sendFailed', {
            defaultValue: 'Could not send this response.',
          })))
        }
      }}
    />
  )
}
