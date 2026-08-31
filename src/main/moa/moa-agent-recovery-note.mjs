export function buildBlockedRecoveryToolMessage(recovery = null, toolName = '') {
  const blockedTools = Array.isArray(recovery?.blockedToolNames) ? recovery.blockedToolNames : []
  const blockedList = blockedTools.length > 0 ? blockedTools.join(', ') : 'the repeated tools'
  return [
    `Tool temporarily blocked by loop recovery: ${String(toolName || 'unknown_tool')}.`,
    `Blocked tools for this recovery round: ${blockedList}.`,
    'Choose one justified file from existing context, use a materially different action, or stop using tools and answer directly.',
  ].join(' ')
}
