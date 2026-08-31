let executeDelegationLazyPromise = null

export async function loadExecuteDelegation() {
  if (!executeDelegationLazyPromise) {
    executeDelegationLazyPromise = import('../tools/agent-executor.mjs')
      .then((mod) => mod.executeDelegation)
  }
  return executeDelegationLazyPromise
}

export function normalizeText(value) {
  return String(value ?? '').trim()
}
