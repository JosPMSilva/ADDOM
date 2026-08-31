import { asTrimmedString } from './terminal-store-shared.js'

export function createTerminalActionNoticeSetter(set) {
  return (message = '', tone = 'info') => {
    const normalizedMessage = asTrimmedString(message)
    set({
      actionNotice: normalizedMessage
        ? { tone: asTrimmedString(tone || 'info') || 'info', message: normalizedMessage }
        : null,
      actionError: '',
    })
  }
}
