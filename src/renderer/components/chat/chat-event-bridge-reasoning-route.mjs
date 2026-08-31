export function resolveAuthoritativeCurrentReasoning({
  full = '',
  current = '',
  hasCurrent = false,
} = {}) {
  return String(hasCurrent ? current : full).trim()
}
