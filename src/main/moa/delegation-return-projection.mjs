import { parseAgentOutputContract } from './agent-output-contract.mjs'

export const DELEGATION_RETURN_BUDGETS = Object.freeze({
  summaryChars: 1_200,
  itemCount: 4,
  parseFailClipChars: 2_000,
  failureClipChars: 2_000,
  stagedInventoryRows: 20,
  envelopeSoftCharsPerAgent: 12_000,
  envelopeHardChars: 48_000,
  synthesisExcerptPerAgent: 16_000,
  synthesisExcerptTotal: 48_000,
  synthesisRawFallbackChars: 40_000,
})

function clean(value) {
  return String(value ?? '').trim()
}

function clip(value, maxChars) {
  const text = clean(value)
  return text.slice(0, Math.max(0, Number(maxChars || 0)))
}

export function hasRevisionBackedStagedWrites(agent = {}) {
  const staged = Array.isArray(agent?.stagedChanges) ? agent.stagedChanges : []
  return staged.some((row) => clean(row?.revisionId).length > 0)
}

function revisionBackedStagedRows(agent = {}) {
  const staged = Array.isArray(agent?.stagedChanges) ? agent.stagedChanges : []
  return staged.filter((row) => clean(row?.revisionId).length > 0)
}

function formatContractProjection(parsed, budgets) {
  const lines = []
  const summary = clip(parsed?.summary, budgets.summaryChars)
  if (summary) lines.push(`Summary: ${summary}`)
  const findings = Array.isArray(parsed?.findings) ? parsed.findings.slice(0, budgets.itemCount) : []
  for (const row of findings) {
    lines.push(
      `Finding [${clean(row.severity) || 'info'}] ${clean(row.file) || '(no file)'}: ${clip(row.issue, 320)}`,
    )
  }
  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations.slice(0, budgets.itemCount)
    : []
  for (const row of recommendations) {
    lines.push(
      `Recommendation [${clean(row.priority) || 'medium'}] ${clip(row.title, 240)}`,
    )
  }
  const scorecard = Array.isArray(parsed?.scorecard) ? parsed.scorecard.slice(0, budgets.itemCount) : []
  for (const row of scorecard) {
    lines.push(`Scorecard ${clip(row.label, 200)}=${Number(row.score) || 0}`)
  }
  return lines
}

function stagedChangeType(change = {}) {
  return clean(change.changeType) || clean(change.type) || 'update'
}

function formatStagedInventory(agent, budgets) {
  const rows = revisionBackedStagedRows(agent).slice(0, budgets.stagedInventoryRows)
  if (rows.length === 0) return []
  const lines = [`Staged changes: ${rows.length}`]
  for (const change of rows) {
    lines.push(
      `- ${clean(change.filePath) || '(unknown path)'} `
      + `[${stagedChangeType(change)}] `
      + `(revision ${clean(change.revisionId)}, `
      + `+${Number(change.addedLines || 0)} / -${Number(change.removedLines || 0)})`,
    )
  }
  return lines
}

/**
 * Per-agent orchestrator projection. Parses agent.output itself (no envelope.reducer).
 * Rich tier only when workspace/tool staged rows carry a revisionId.
 */
export function projectAgentReturnForOrchestrator(agent = {}, options = {}) {
  const budgets = { ...DELEGATION_RETURN_BUDGETS, ...(options.budgets || {}) }
  const status = clean(agent?.status).toLowerCase() || 'unknown'
  const rich = hasRevisionBackedStagedWrites(agent)
  const parsed = parseAgentOutputContract(agent?.output, {
    type: agent?.outputContractType,
  })
  const lines = []

  if (status === 'completed') {
    if (parsed.parsedOk) {
      lines.push(...formatContractProjection(parsed, budgets))
    } else {
      const salvage = clip(agent?.output || parsed.summary, budgets.parseFailClipChars)
      lines.push(salvage || '[no agent output]')
    }
    if (rich) lines.push(...formatStagedInventory(agent, budgets))
  } else if (status === 'pending') {
    lines.push('Pending: waiting for runtime role approval before dispatch.')
  } else {
    lines.push(`Error: ${clean(agent?.error) || 'Unknown error'}`)
    const partial = clip(agent?.output, budgets.failureClipChars)
    if (partial) {
      lines.push('Partial output:')
      lines.push(partial)
    }
  }

  const text = lines.join('\n').trim()
  let mode = 'error'
  if (status === 'pending') mode = 'pending'
  else if (status === 'completed') {
    if (rich) mode = 'contract_with_staged'
    else if (parsed.parsedOk) mode = 'contract'
    else mode = 'clipped_output'
  }
  return {
    text: text || '[no projected output]',
    rich,
    parsedOk: parsed.parsedOk === true,
    mode,
  }
}

const SYNTHESIS_BODY_MODES = new Set([
  'contract_with_staged',
  'error',
])

/**
 * Body excerpts when reducer.parsedOk: writers + failures only.
 * Parse-fail salvage is handled by the synthesis raw_fallback rebuild, not this gate.
 */
export function shouldIncludeAgentBodyInSynthesis(agent = {}, options = {}) {
  if (options.force === true) return true
  const projected = projectAgentReturnForOrchestrator(agent, options)
  if (SYNTHESIS_BODY_MODES.has(projected.mode)) return true
  // Explicit pending stays out; unknown/non-completed that projected as error already covered.
  return false
}

export function projectAgentBodyExcerptForSynthesis(agent = {}, options = {}) {
  const budgets = { ...DELEGATION_RETURN_BUDGETS, ...(options.budgets || {}) }
  const projected = projectAgentReturnForOrchestrator(agent, options)
  if (!shouldIncludeAgentBodyInSynthesis(agent, options)) {
    return { include: false, text: '', truncated: false, mode: projected.mode }
  }
  const clipped = clip(projected.text, budgets.synthesisExcerptPerAgent)
  return {
    include: true,
    text: clipped || '[no output]',
    truncated: clean(projected.text).length > budgets.synthesisExcerptPerAgent,
    mode: projected.mode,
  }
}
