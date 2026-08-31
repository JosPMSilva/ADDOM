import React from 'react'
import { providerHasCredential } from '../../../common/api-clients/provider-credential-state.mjs'
import { resolveProviderProcessingMode } from '../../../common/api-clients/provider-processing-mode.mjs'
import useChatStore from '../../store/useChatStore.js'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'

function ChatProcessingModeControl({
  provider = null,
  modelId = '',
  activeThreadId = '',
  disabled = false,
}) {
  const { t } = useRendererTranslation(['core'])
  const processingMode = useChatStore((state) => state.processingMode)
  const returnedProcessingMode = useChatStore((state) => state.returnedProcessingMode)
  const setProcessingMode = useChatStore((state) => state.setProcessingMode)
  const providerId = String(provider?.id || '').trim().toLowerCase()
  const authMethod = String(provider?.authMethod || 'api_key').trim().toLowerCase()
  const processing = resolveProviderProcessingMode({
    providerId,
    modelId,
    authMethod,
    providerConfigured: providerHasCredential(provider),
    requestedMode: processingMode,
  })

  if (!processing.availableModes.includes('fast')) return null

  const fast = processingMode === 'fast'
  const fastLabel = t('core:chat.controlRail.processingMode.fast', { defaultValue: 'Fast' })
  const standardLabel = t('core:chat.controlRail.processingMode.standard', { defaultValue: 'Standard' })
  const pricingNote = t('core:chat.controlRail.processingMode.pricingNote', {
    defaultValue: 'Faster processing may use premium pricing.',
  })
  const returnedNote = returnedProcessingMode
    ? t('core:chat.controlRail.processingMode.returnedMode', {
        defaultValue: 'Last response used {{mode}} processing.',
        mode: returnedProcessingMode === 'fast' ? fastLabel : standardLabel,
      })
    : ''
  const title = [
    fast
      ? t('core:chat.controlRail.processingMode.disable', { defaultValue: 'Use standard processing' })
      : t('core:chat.controlRail.processingMode.enable', { defaultValue: 'Use faster processing' }),
    pricingNote,
    returnedNote,
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setProcessingMode(fast ? 'standard' : 'fast', { threadId: activeThreadId })}
      className={[
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
        fast
          ? 'bg-accent-strong text-surface hover:bg-accent-hover'
          : 'bg-transparent text-text-secondary hover:bg-surface-panel-alt/30 hover:text-text-primary',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
      title={title}
      aria-label={title}
      aria-pressed={fast}
      data-ui="chat-composer-processing-mode"
    >
      <Icon name="lightning" className="text-sm" />
    </button>
  )
}

export default React.memo(ChatProcessingModeControl)
