export function createUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }
}

export function normalizeUsage(raw) {
  if (!raw || typeof raw !== 'object') return createUsage()
  const input = Number(raw.inputTokens || 0)
  const output = Number(raw.outputTokens || 0)
  const reasoning = Number(raw.reasoningTokens || 0)
  const total = Number(raw.totalTokens || (input + output + reasoning) || 0)
  const usage = {
    inputTokens: Number.isFinite(input) ? input : 0,
    outputTokens: Number.isFinite(output) ? output : 0,
    reasoningTokens: Number.isFinite(reasoning) ? reasoning : 0,
    totalTokens: Number.isFinite(total) ? total : 0,
  }
  if (['exclusive', 'inclusive', 'unknown_scope'].includes(raw.scope)) {
    usage.scope = raw.scope
    usage.costUsd = Number.isFinite(Number(raw.costUsd)) ? Number(raw.costUsd) : 0
    usage.rawProviderUsage = raw.rawProviderUsage ?? raw
  }
  return usage
}

export function addUsage(acc, delta) {
  if (delta?.scope === 'unknown_scope') return
  acc.inputTokens += Number(delta.inputTokens || 0)
  acc.outputTokens += Number(delta.outputTokens || 0)
  acc.reasoningTokens += Number(delta.reasoningTokens || 0)
  acc.totalTokens += Number(delta.totalTokens || 0)
}

