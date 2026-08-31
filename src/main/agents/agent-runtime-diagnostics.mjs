import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'

export const AGENT_RUNTIME_DIAGNOSTIC_RETENTION_MS = 14 * 24 * 60 * 60 * 1_000

export const AGENT_RUNTIME_DIAGNOSTIC_KINDS = Object.freeze([
  'spawn_latency',
  'queue_latency',
  'admission_rejection',
  'cancellation',
  'reconnect',
  'reconciliation',
  'orphan',
  'dedupe',
  'sequence_gap',
  'projection_replay',
  'approval_age',
  'workspace_allocation',
  'workspace_cleanup',
  'merge_conflict',
  'transcript_hydration',
  'renderer_reconciliation',
])

const KIND_SET = new Set(AGENT_RUNTIME_DIAGNOSTIC_KINDS)
const SAFE_TOKEN_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/
const SAFE_ID_PATTERN = /^\S{1,256}$/
const CONTENT_BEARING_KEY_PATTERN = /(prompt|transcript|message|content|text|delta|command|secret|credential|authorization|path|url)/i

function requireIdentifier(value, label, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null
  const normalized = String(value || '').trim()
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.codePointAt(0)
    return code <= 31 || code === 127
  })
  if (!SAFE_ID_PATTERN.test(normalized) || hasControlCharacter) {
    throw new TypeError(`${label} must be a safe non-empty identifier`)
  }
  return normalized
}

function requireSafeToken(value, label) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!SAFE_TOKEN_PATTERN.test(normalized)) throw new TypeError(`${label} must be a safe diagnostic token`)
  return normalized
}

function normalizeDuration(value) {
  if (value === null || value === undefined) return null
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new TypeError('durationMs must be a non-negative finite number')
  }
  return normalized
}

function normalizeAttributes(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Diagnostic attributes must be an object')
  }
  const output = {}
  for (const [rawKey, value] of Object.entries(input)) {
    const key = String(rawKey || '').trim()
    if (!SAFE_TOKEN_PATTERN.test(key) || CONTENT_BEARING_KEY_PATTERN.test(key)) {
      throw new TypeError(`Diagnostic attribute "${key}" is content-bearing or invalid`)
    }
    if (value === null || typeof value === 'boolean') {
      output[key] = value
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value
      continue
    }
    if (typeof value === 'string' && SAFE_TOKEN_PATTERN.test(value)) {
      output[key] = value
      continue
    }
    throw new TypeError(`Diagnostic attribute value for "${key}" must be content-free`)
  }
  return output
}

function percentile(values, ratio) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]
}

function mapDetailedRow(row) {
  return {
    diagnosticId: row.diagnostic_id,
    kind: row.kind,
    runId: row.run_id,
    nodeId: row.node_id,
    attemptId: row.attempt_id,
    providerClass: row.provider_class,
    monotonicAt: Number(row.monotonic_at),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    outcome: row.outcome,
    correlationId: row.correlation_id,
    attributes: JSON.parse(row.attributes_json || '{}'),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
  }
}

export function createAgentRuntimeDiagnostics(db, {
  idFactory = randomUUID,
  now = Date.now,
  monotonicNow = performance.now.bind(performance),
} = {}) {
  const insert = db.prepare(`
    INSERT INTO agent_runtime_diagnostics (
      diagnostic_id, kind, run_id, node_id, attempt_id, provider_class,
      monotonic_at, duration_ms, outcome, correlation_id, attributes_json,
      created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  function record(input = {}) {
    const kind = String(input.kind || '').trim().toLowerCase()
    if (!KIND_SET.has(kind)) throw new TypeError(`Unsupported agent runtime diagnostic kind: ${kind || 'empty'}`)
    const createdAt = Number(now())
    const monotonicAt = input.monotonicAt === undefined
      ? Number(monotonicNow())
      : Number(input.monotonicAt)
    if (!Number.isFinite(createdAt) || !Number.isFinite(monotonicAt)) {
      throw new TypeError('Diagnostic timestamps must be finite numbers')
    }
    const row = {
      diagnosticId: requireIdentifier(input.diagnosticId || idFactory(), 'diagnosticId'),
      kind,
      runId: requireIdentifier(input.runId, 'runId'),
      nodeId: requireIdentifier(input.nodeId, 'nodeId', { nullable: true }),
      attemptId: requireIdentifier(input.attemptId, 'attemptId', { nullable: true }),
      providerClass: requireSafeToken(input.providerClass, 'Provider class'),
      monotonicAt,
      durationMs: normalizeDuration(input.durationMs),
      outcome: requireSafeToken(input.outcome, 'Outcome'),
      correlationId: requireIdentifier(input.correlationId, 'correlationId', { nullable: true }),
      attributes: normalizeAttributes(input.attributes),
      createdAt,
      expiresAt: createdAt + AGENT_RUNTIME_DIAGNOSTIC_RETENTION_MS,
    }
    insert.run(
      row.diagnosticId,
      row.kind,
      row.runId,
      row.nodeId,
      row.attemptId,
      row.providerClass,
      row.monotonicAt,
      row.durationMs,
      row.outcome,
      row.correlationId,
      JSON.stringify(row.attributes),
      row.createdAt,
      row.expiresAt,
    )
    return Object.freeze(row)
  }

  function listDetailed({ runId = '', limit = 500 } = {}) {
    const normalizedLimit = Math.max(1, Math.min(5_000, Math.trunc(Number(limit) || 500)))
    const rows = runId
      ? db.prepare(`
          SELECT * FROM agent_runtime_diagnostics
          WHERE run_id = ? ORDER BY created_at ASC, diagnostic_id ASC LIMIT ?
        `).all(requireIdentifier(runId, 'runId'), normalizedLimit)
      : db.prepare(`
          SELECT * FROM agent_runtime_diagnostics
          ORDER BY created_at ASC, diagnostic_id ASC LIMIT ?
        `).all(normalizedLimit)
    return rows.map(mapDetailedRow)
  }

  function exportAggregates({ since = 0 } = {}) {
    const normalizedSince = Math.max(0, Math.trunc(Number(since) || 0))
    const source = db.prepare(`
      SELECT kind, provider_class, outcome, duration_ms
      FROM agent_runtime_diagnostics
      WHERE created_at >= ?
      ORDER BY kind ASC, provider_class ASC, outcome ASC, created_at ASC
    `).all(normalizedSince)
    const groups = new Map()
    for (const row of source) {
      const key = `${row.kind}\0${row.provider_class}\0${row.outcome}`
      const group = groups.get(key) || {
        kind: row.kind,
        providerClass: row.provider_class,
        outcome: row.outcome,
        count: 0,
        durations: [],
      }
      group.count += 1
      if (row.duration_ms !== null && Number.isFinite(Number(row.duration_ms))) {
        group.durations.push(Number(row.duration_ms))
      }
      groups.set(key, group)
    }
    const rows = [...groups.values()].map(({ durations, ...group }) => ({
      ...group,
      durationMs: durations.length === 0
        ? null
        : {
            average: durations.reduce((sum, value) => sum + value, 0) / durations.length,
            p95: percentile(durations, 0.95),
            max: Math.max(...durations),
          },
    }))
    return Object.freeze({
      schemaVersion: 1,
      generatedAt: Number(now()),
      retentionDays: AGENT_RUNTIME_DIAGNOSTIC_RETENTION_MS / (24 * 60 * 60 * 1_000),
      totalCount: source.length,
      rows,
    })
  }

  function pruneExpired() {
    const result = db.prepare(`
      DELETE FROM agent_runtime_diagnostics WHERE expires_at <= ?
    `).run(Number(now()))
    return { deleted: result.changes }
  }

  return Object.freeze({ record, listDetailed, exportAggregates, pruneExpired })
}

export function recordAgentRuntimeDiagnostic(
  diagnostics,
  input,
  warn = console.warn,
) {
  if (!diagnostics || typeof diagnostics.record !== 'function') return null
  try {
    return diagnostics.record(input)
  } catch (error) {
    warn('[agent-runtime-diagnostics] Local diagnostic recording failed.', error)
    return null
  }
}
