/**
 * Cursor-inspired L2 label: dimmer verb, mid-tone identity.
 * Reasoning stays on text-secondary (brighter gray, not primary/white).
 */
export default function ExecutionToolRowLabel({
  label = '',
  verb = '',
  identity = '',
  className = '',
} = {}) {
  const full = String(label || '').trim()
  const verbText = String(verb || '').trim()
  const identityText = String(identity || '').trim()
  if (verbText && identityText) {
    return (
      <span className={`chat-typo-exec-row-label min-w-0 truncate ${className}`.trim()}>
        <span className="chat-typo-exec-row-verb text-text-tertiary">{verbText}</span>
        {' '}
        <span className="chat-typo-exec-row-identity text-text-subtle">{identityText}</span>
      </span>
    )
  }
  return (
    <span className={`chat-typo-exec-row-label chat-typo-exec-row-verb min-w-0 truncate text-text-tertiary ${className}`.trim()}>
      {full || verbText}
    </span>
  )
}
