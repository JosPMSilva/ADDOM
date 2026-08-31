/**
 * Decide whether an OpenAI account session update should refresh vault providers.
 * Rate-limit ticks keep hasSession stable; connect/disconnect flips it.
 */
export function openAIAccountSessionCredentialChanged(previousSession = null, nextSession = null) {
  const previousHasSession = previousSession?.hasSession === true
  const nextHasSession = nextSession?.hasSession === true
  return previousHasSession !== nextHasSession
}
