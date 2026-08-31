import { buildOrchestratorContinuationHistory } from '../agents/agent-orchestrator-synthesis.mjs'

export function appendAgentContinuationHistory({ history, pendingAgentMessages }) {
  const childContinuations = []
  for (const message of Array.isArray(pendingAgentMessages) ? pendingAgentMessages : []) {
    if (message?.kind === 'child_turn_final' && message?.continuation) {
      childContinuations.push(message.continuation)
      continue
    }
    const content = String(message?.text || '').trim()
    if (content) history.push({ role: 'user', content })
  }
  if (childContinuations.length > 0) {
    history.push(...buildOrchestratorContinuationHistory({ continuations: childContinuations }))
  }
}
