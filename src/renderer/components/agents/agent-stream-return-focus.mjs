/**
 * Decide the next step when returning from a child conversation to a parent-stream
 * Agents group. Expand must complete before focus/clear so hidden rows are not targets.
 *
 * @returns {null | { type: 'expand' } | { type: 'focus', focusNodeId: string }}
 */
export function planStreamReturnFocus({
  focusNodeId = '',
  focusSurface = '',
  collapsed = false,
  referencesContainFocus = false,
} = {}) {
  const nodeId = String(focusNodeId || '')
  if (!nodeId || String(focusSurface || '') !== 'stream') return null
  if (!referencesContainFocus) return null
  if (collapsed) return { type: 'expand' }
  return { type: 'focus', focusNodeId: nodeId }
}
