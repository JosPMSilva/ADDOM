import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function EmptyState({ configuredCount, mode }) {
  const { t } = useRendererTranslation(['core'])
  const description = configuredCount > 0
    ? mode === 'plan'
      ? t('core:chat.emptyState.planDescription', {
        defaultValue: 'Plan mode is active. Ask for a structured plan, then use interactive choices in the response to guide the path.',
      })
      : mode === 'thinking'
        ? t('core:chat.emptyState.thinkingDescription', {
          defaultValue: 'Thinking mode is active. Brainstorm options and tradeoffs here, then switch to Execute when ready to implement.',
        })
        : t('core:chat.emptyState.executeDescription', {
          defaultValue: 'Select a provider and start chatting. Use the header [[canon:permission_mode]] control to switch between [[canon:ask]], [[canon:autonomy]], and [[canon:full_access]] for [[canon:execute]] turns.',
        })
    : t('core:chat.emptyState.needsProviderSetup', {
      defaultValue: 'Connect OpenAI account auth or add an API key in Settings, then select a provider to start.',
    })

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 pb-[10vh] text-center"
      data-ui="chat-empty-state"
    >
      <p className="text-sm font-medium text-text-secondary">
        {t('core:chat.emptyState.title', { defaultValue: 'No messages yet' })}
      </p>
      <p className="max-w-sm text-xs leading-5 text-text-muted">{description}</p>
    </div>
  )
}
