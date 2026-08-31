const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export async function scheduleManagedTaskInputs({
  inputs,
  snapshots,
  sequential,
  prepareSequentialInput,
  spawnInput,
  waitForNode,
  readResult,
  cancelNode,
  isRunTerminal,
}) {
  const nodes = []
  const priorResults = []
  let upstreamFailed = false

  for (const [index, originalInput] of inputs.entries()) {
    if (isRunTerminal()) break
    const input = sequential && !upstreamFailed && typeof prepareSequentialInput === 'function'
      ? await prepareSequentialInput({
          input: originalInput,
          priorResults: [...priorResults],
          index,
        })
      : originalInput
    const spawned = await spawnInput(input || originalInput, snapshots[index])
    nodes.push(spawned)
    if (!sequential) continue
    if (upstreamFailed) {
      cancelNode(spawned, 'upstream_sequential_step_failed')
    } else {
      await waitForNode(spawned)
    }
    const result = readResult(spawned)
    priorResults.push(result)
    if (!TERMINAL_STATUSES.has(result?.node?.status)) {
      throw new TypeError(`Sequential agent ${spawned.nodeId} did not reach a terminal state`)
    }
    if (result.node.status !== 'completed') upstreamFailed = true
  }

  return nodes
}
