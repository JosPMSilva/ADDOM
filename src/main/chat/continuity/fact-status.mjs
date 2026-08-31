import { CONTINUITY_FACT_STATUSES } from './packet-schema.mjs'

export function normalizeContinuityFactStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'closed') return 'resolved'
  return CONTINUITY_FACT_STATUSES.includes(value) ? value : 'active'
}
