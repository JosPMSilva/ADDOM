/**
 * Mirrors LiveExecutionStreamBlock's "would render something" gate so TurnShell
 * does not reserve an empty execution slot (phantom space-y gap).
 */
export function shouldRenderExecutionTurn(
  turn = null,
  {
    isLiveTurn = false,
    canContinueInterrupted = false,
  } = {},
) {
  if (!turn || typeof turn !== 'object') return false
  const status = String(turn.status || (isLiveTurn ? 'active' : '')).trim().toLowerCase()
  if (isLiveTurn || status === 'active') return true
  if (status === 'interrupted' && canContinueInterrupted) return true

  const eventOrder = Array.isArray(turn.eventOrder) ? turn.eventOrder : []
  if (eventOrder.length > 0) return true

  const itemOrder = Array.isArray(turn.itemOrder) ? turn.itemOrder : []
  if (itemOrder.length > 0) return true

  const eventsById = turn.eventsById && typeof turn.eventsById === 'object'
    ? turn.eventsById
    : null
  if (eventsById && Object.keys(eventsById).length > 0) return true

  return false
}
