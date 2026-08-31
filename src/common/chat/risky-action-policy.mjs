export const DEFAULT_RISKY_ACTION_POLICY = 'prompt_first_risky_use'

export function normalizeRiskyActionPolicy(value, fallback = DEFAULT_RISKY_ACTION_POLICY) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'prompt_first_risky_use') return 'prompt_first_risky_use'
  const fallbackValue = String(fallback || DEFAULT_RISKY_ACTION_POLICY).trim().toLowerCase()
  return fallbackValue === 'prompt_first_risky_use' ? 'prompt_first_risky_use' : DEFAULT_RISKY_ACTION_POLICY
}
