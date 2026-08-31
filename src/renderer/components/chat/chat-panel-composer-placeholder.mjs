import i18n from '../../i18n/init.mjs'

function translateComposerPlaceholder(key, defaultValue) {
  if (i18n?.isInitialized === true) {
    const translated = i18n.t(key, { defaultValue })
    if (typeof translated === 'string' && translated && translated !== key) {
      return translated
    }
  }
  return defaultValue
}

export function buildChatComposerPlaceholder({
  selectedProvider = '',
  activeThreadId = '',
  isStreaming = false,
  chatMode = 'execute',
} = {}) {
  if (!selectedProvider) {
    return translateComposerPlaceholder(
      'core:chat.composer.placeholder.selectProvider',
      'Select a provider to start...',
    )
  }
  if (!activeThreadId) {
    return translateComposerPlaceholder(
      'core:chat.composer.placeholder.selectThread',
      'Select or create a thread to continue...',
    )
  }
  if (isStreaming) {
    return translateComposerPlaceholder(
      'core:chat.composer.placeholder.streaming',
      'AI is thinking...',
    )
  }
  if (chatMode === 'plan') {
    return translateComposerPlaceholder(
      'core:chat.composer.placeholder.plan',
      'Ask for a plan... (Enter to send, Shift+Enter for newline)',
    )
  }
  if (chatMode === 'thinking') {
    return translateComposerPlaceholder(
      'core:chat.composer.placeholder.thinking',
      'Brainstorm ideas, tradeoffs, and direction... (Enter to send, Shift+Enter for newline)',
    )
  }
  return translateComposerPlaceholder(
    'core:chat.composer.placeholder.execute',
    'Ask anything about your project... (Enter to send, Shift+Enter for newline)',
  )
}
