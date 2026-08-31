import {
  DEFAULT_AGENT_OUTPUT_LIMITS,
  parseAgentOutputContract,
} from './agent-output-contract.mjs'

const SEVERITY_WEIGHT = Object.freeze({
  security: 5,
  correctness: 4,
  completeness: 3,
  performance: 2,
  info: 1,
})

const PRIORITY_WEIGHT = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
})

function clean(value) {
  return String(value ?? '').trim()
}

function findingKey(row = {}) {
  return [
    clean(row.file).toLowerCase(),
    clean(row.issue).toLowerCase(),
  ].join('|')
}

function recommendationKey(row = {}) {
  return [
    clean(row.file).toLowerCase(),
    clean(row.title).toLowerCase(),
  ].join('|')
}

function stagedChangeKey(row = {}) {
  return [
    clean(row.filePath).toLowerCase(),
    clean(row.changeType).toLowerCase(),
  ].join('|')
}

function scorecardKey(row = {}) {
  return clean(row.label).toLowerCase()
}

function severityWeight(value = '') {
  return Number(SEVERITY_WEIGHT[clean(value).toLowerCase()] || 0)
}

function priorityWeight(value = '') {
  return Number(PRIORITY_WEIGHT[clean(value).toLowerCase()] || 0)
}

function choosePreferredText(current = '', candidate = '', maxChars = 800) {
  const currentText = clean(current)
  const candidateText = clean(candidate)
  if (!currentText) return candidateText.slice(0, maxChars)
  if (!candidateText) return currentText.slice(0, maxChars)
  if (currentText.toLowerCase() === candidateText.toLowerCase()) return currentText.slice(0, maxChars)
  if (currentText.toLowerCase().includes(candidateText.toLowerCase())) return currentText.slice(0, maxChars)
  if (candidateText.toLowerCase().includes(currentText.toLowerCase())) return candidateText.slice(0, maxChars)
  return `${currentText}\n${candidateText}`.slice(0, maxChars)
}

function mergeFindingEntries(current = {}, candidate = {}) {
  const currentSeverity = clean(current.severity).toLowerCase()
  const candidateSeverity = clean(candidate.severity).toLowerCase()
  const promotedSeverity = severityWeight(candidateSeverity) > severityWeight(currentSeverity)
    ? candidateSeverity
    : currentSeverity

  return {
    ...current,
    severity: promotedSeverity || currentSeverity || candidateSeverity || 'info',
    evidence: choosePreferredText(current.evidence, candidate.evidence, 500),
    suggestion: choosePreferredText(current.suggestion, candidate.suggestion, 800),
    taskId: clean(current.taskId || candidate.taskId),
    roleId: clean(current.roleId || candidate.roleId),
    role: clean(current.role || candidate.role),
  }
}

function mergeRecommendationEntries(current = {}, candidate = {}) {
  const currentPriority = clean(current.priority).toLowerCase()
  const candidatePriority = clean(candidate.priority).toLowerCase()
  const promotedPriority = priorityWeight(candidatePriority) > priorityWeight(currentPriority)
    ? candidatePriority
    : currentPriority

  return {
    ...current,
    priority: promotedPriority || currentPriority || candidatePriority || 'medium',
    rationale: choosePreferredText(current.rationale, candidate.rationale, 800),
    taskId: clean(current.taskId || candidate.taskId),
    roleId: clean(current.roleId || candidate.roleId),
    role: clean(current.role || candidate.role),
  }
}

function mergeStagedChangeEntries(current = {}, candidate = {}) {
  return {
    ...current,
    rationale: choosePreferredText(current.rationale, candidate.rationale, 800),
    taskId: clean(current.taskId || candidate.taskId),
    roleId: clean(current.roleId || candidate.roleId),
    role: clean(current.role || candidate.role),
  }
}

function mergeScorecardEntries(current = {}, candidate = {}) {
  const currentSources = Math.max(1, Number(current._sources || 1))
  const candidateSources = Math.max(1, Number(candidate._sources || 1))
  const currentTotal = Number(current._scoreTotal ?? current.score ?? 0)
  const candidateTotal = Number(candidate._scoreTotal ?? candidate.score ?? 0)
  const nextSources = currentSources + candidateSources
  const nextTotal = currentTotal + candidateTotal

  return {
    ...current,
    score: Math.round(nextTotal / nextSources),
    rationale: choosePreferredText(current.rationale, candidate.rationale, 800),
    taskId: clean(current.taskId || candidate.taskId),
    roleId: clean(current.roleId || candidate.roleId),
    role: clean(current.role || candidate.role),
    _sources: nextSources,
    _scoreTotal: nextTotal,
  }
}

function rankFindings(rows = []) {
  return [...rows].sort((a, b) => {
    const wa = Number(SEVERITY_WEIGHT[a.severity] || 0)
    const wb = Number(SEVERITY_WEIGHT[b.severity] || 0)
    if (wa !== wb) return wb - wa
    return clean(a.issue).localeCompare(clean(b.issue))
  })
}

function rankRecommendations(rows = []) {
  return [...rows].sort((a, b) => {
    const wa = priorityWeight(a.priority)
    const wb = priorityWeight(b.priority)
    if (wa !== wb) return wb - wa
    return clean(a.title).localeCompare(clean(b.title))
  })
}

function rankStagedChanges(rows = []) {
  return [...rows].sort((a, b) => {
    const fileCompare = clean(a.filePath).localeCompare(clean(b.filePath))
    if (fileCompare !== 0) return fileCompare
    return clean(a.changeType).localeCompare(clean(b.changeType))
  })
}

function rankScorecard(rows = []) {
  return [...rows].sort((a, b) => {
    const scoreDelta = Number(b.score || 0) - Number(a.score || 0)
    if (scoreDelta !== 0) return scoreDelta
    return clean(a.label).localeCompare(clean(b.label))
  })
}

export function reduceDelegationOutputs(agents = [], limits = DEFAULT_AGENT_OUTPUT_LIMITS) {
  const agentRows = Array.isArray(agents) ? agents : []
  const parseRows = agentRows.map((agent) => {
    const parsed = parseAgentOutputContract(agent?.output, {
      ...limits,
      type: agent?.outputContractType,
    })
    return {
      taskId: clean(agent?.taskId),
      roleId: clean(agent?.roleId),
      role: clean(agent?.role),
      status: clean(agent?.status),
      outputContractType: clean(agent?.outputContractType),
      parsed,
    }
  })

  let droppedFindings = 0
  const collected = []
  const collectedRecommendations = []
  const collectedStagedChanges = []
  const collectedScorecard = []
  const rawFallbacks = []
  const agentsummaries = []

  for (const row of parseRows) {
    if (!row.parsed.parsedOk) {
      if (row.parsed.raw) {
        rawFallbacks.push({
          taskId: row.taskId,
          roleId: row.roleId,
          role: row.role,
          parseError: row.parsed.parseError,
          raw: row.parsed.raw,
        })
      }
      agentsummaries.push({
        taskId: row.taskId,
        roleId: row.roleId,
        role: row.role,
        contractType: row.parsed.contractType || row.outputContractType || 'findings',
        parsedOk: false,
        summary: row.parsed.summary,
        findings: 0,
        recommendations: 0,
        stagedChanges: 0,
        scorecard: 0,
      })
      continue
    }

    agentsummaries.push({
      taskId: row.taskId,
      roleId: row.roleId,
      role: row.role,
      contractType: row.parsed.contractType || row.outputContractType || 'findings',
      parsedOk: true,
      summary: row.parsed.summary,
      findings: row.parsed.findings.length,
      recommendations: Array.isArray(row.parsed.recommendations) ? row.parsed.recommendations.length : 0,
      stagedChanges: Array.isArray(row.parsed.stagedChanges) ? row.parsed.stagedChanges.length : 0,
      scorecard: Array.isArray(row.parsed.scorecard) ? row.parsed.scorecard.length : 0,
    })

    for (const recommendation of row.parsed.recommendations) {
      if (!recommendation.title) continue
      collectedRecommendations.push({
        ...recommendation,
        taskId: row.taskId,
        roleId: row.roleId,
        role: row.role,
      })
    }

    for (const stagedChange of row.parsed.stagedChanges) {
      if (!stagedChange.filePath) continue
      collectedStagedChanges.push({
        ...stagedChange,
        taskId: row.taskId,
        roleId: row.roleId,
        role: row.role,
      })
    }

    for (const scorecardEntry of row.parsed.scorecard) {
      if (!scorecardEntry.label) continue
      collectedScorecard.push({
        ...scorecardEntry,
        taskId: row.taskId,
        roleId: row.roleId,
        role: row.role,
        _sources: 1,
        _scoreTotal: Number(scorecardEntry.score || 0),
      })
    }

    for (const finding of row.parsed.findings) {
      if (!finding.issue) {
        droppedFindings += 1
        continue
      }
      collected.push({
        ...finding,
        taskId: row.taskId,
        roleId: row.roleId,
        role: row.role,
      })
    }
  }

  const dedupedByKey = new Map()
  let mergedSeverityConflicts = 0
  for (const finding of collected) {
    const key = findingKey(finding)
    if (!dedupedByKey.has(key)) {
      dedupedByKey.set(key, finding)
      continue
    }
    const existing = dedupedByKey.get(key)
    if (clean(existing?.severity).toLowerCase() !== clean(finding?.severity).toLowerCase()) {
      mergedSeverityConflicts += 1
    }
    dedupedByKey.set(key, mergeFindingEntries(existing, finding))
  }
  const deduped = rankFindings([...dedupedByKey.values()])
  const dedupeCount = Math.max(0, collected.length - deduped.length)

  const recommendationsByKey = new Map()
  for (const recommendation of collectedRecommendations) {
    const key = recommendationKey(recommendation)
    if (!key) continue
    if (!recommendationsByKey.has(key)) {
      recommendationsByKey.set(key, recommendation)
      continue
    }
    recommendationsByKey.set(key, mergeRecommendationEntries(recommendationsByKey.get(key), recommendation))
  }
  const dedupedRecommendations = rankRecommendations([...recommendationsByKey.values()])
  const recommendationDedupeCount = Math.max(0, collectedRecommendations.length - dedupedRecommendations.length)

  const stagedChangesByKey = new Map()
  for (const stagedChange of collectedStagedChanges) {
    const key = stagedChangeKey(stagedChange)
    if (!key) continue
    if (!stagedChangesByKey.has(key)) {
      stagedChangesByKey.set(key, stagedChange)
      continue
    }
    stagedChangesByKey.set(key, mergeStagedChangeEntries(stagedChangesByKey.get(key), stagedChange))
  }
  const dedupedStagedChanges = rankStagedChanges([...stagedChangesByKey.values()])
  const stagedChangeDedupeCount = Math.max(0, collectedStagedChanges.length - dedupedStagedChanges.length)

  const scorecardByKey = new Map()
  for (const scorecardEntry of collectedScorecard) {
    const key = scorecardKey(scorecardEntry)
    if (!key) continue
    if (!scorecardByKey.has(key)) {
      scorecardByKey.set(key, scorecardEntry)
      continue
    }
    scorecardByKey.set(key, mergeScorecardEntries(scorecardByKey.get(key), scorecardEntry))
  }
  const dedupedScorecard = rankScorecard(
    [...scorecardByKey.values()].map((row) => ({
      label: row.label,
      score: Number(row.score || 0),
      rationale: row.rationale,
      taskId: row.taskId,
      roleId: row.roleId,
      role: row.role,
    })),
  )
  const scorecardDedupeCount = Math.max(0, collectedScorecard.length - dedupedScorecard.length)
  const parsedOk = rawFallbacks.length === 0 && agentRows.length > 0

  const compactText = [
    'Reducer packet (structured agent outputs):',
    `parsedOk: ${parsedOk}`,
    `dedupeCount: ${dedupeCount}`,
    `recommendationDedupeCount: ${recommendationDedupeCount}`,
    `stagedChangeDedupeCount: ${stagedChangeDedupeCount}`,
    `scorecardDedupeCount: ${scorecardDedupeCount}`,
    `mergedSeverityConflicts: ${mergedSeverityConflicts}`,
    `droppedFindings: ${droppedFindings}`,
    `findings: ${deduped.length}`,
    `recommendations: ${dedupedRecommendations.length}`,
    `stagedChanges: ${dedupedStagedChanges.length}`,
    `scorecard: ${dedupedScorecard.length}`,
    ...deduped.slice(0, 40).map((row, idx) => (
      `${idx + 1}. [${row.severity}] ${row.file || '(no file)'} :: ${row.issue}`
    )),
  ].join('\n')

  return {
    parsedOk,
    dedupeCount,
    recommendationDedupeCount,
    stagedChangeDedupeCount,
    scorecardDedupeCount,
    mergedSeverityConflicts,
    droppedFindings,
    findings: deduped,
    recommendations: dedupedRecommendations,
    stagedChanges: dedupedStagedChanges,
    scorecard: dedupedScorecard,
    agentsummaries,
    rawFallbacks,
    compactText,
  }
}

