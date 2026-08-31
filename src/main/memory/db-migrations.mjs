import { ensureArtifactColumns, ensureCoreTables, ensureNodeColumns } from './db-schema-core.mjs'
import { ensureAgentRunTables } from './db-schema-agent-runs.mjs'
import { ensureAgentConversationMailboxDeliveryColumns, ensureAgentConversationTables, ensureAgentPromotionRetentionTables } from './db-schema-agent-conversations.mjs'
import { ensureIndexes } from './db-indexes.mjs'
import {
  backfillLegacyCanonicalChatEventColumns,
  ensureContinuityTables,
  ensureAttachmentColumns,
  ensureCanonicalChatEventColumns,
  ensureMoaColumns,
  ensureMoaAgentMemoryTable,
  ensureMoaTables,
  ensureThreadContinuityTables,
  ensureWorkspaceTables,
  ensureWorkspaceThreadColumns,
} from './db-schema-workspace.mjs'
import { migrateLegacyMoaTransactions } from './agent-legacy-migration.mjs'
import {
  ensureAgentConversationLegacyForensicsTable,
  migrateLegacyAgentChildConversations,
} from './agent-conversation-legacy-migration.mjs'
import {
  ensureOpenAIProviderColumns,
  ensureOpenAIProviderTables,
  ensureProviderBudgetColumns,
  ensureProviderBudgetTables,
} from './db-schema-provider.mjs'
import {
  ensureTerminalSessionArchiveColumns,
  ensureTerminalSessionArchiveTable,
} from './db-schema-terminal.mjs'

export const SCHEMA_VERSION = 29

const GLOBAL_MEMORY_PROJECT_KEY = '__addom_global__'
const TERMINAL_THREAD_TAG_PREFIX = 'terminal_thread:'

function getUserVersion(db) {
  return Number(db.pragma('user_version', { simple: true }) || 0)
}

function setUserVersion(db, value) {
  const n = Math.max(0, Math.round(Number(value) || 0))
  db.pragma(`user_version = ${n}`)
}

function parseTagsJson(raw = '[]') {
  try {
    const parsed = JSON.parse(String(raw || '[]'))
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean) : []
  } catch {
    return []
  }
}

function normalizeNullableText(value = '') {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function deriveNodeScope(row = null) {
  const scope = String(row?.scope || '').trim().toLowerCase()
  if (scope === 'thread' || scope === 'project' || scope === 'global') return scope
  return String(row?.project || '').trim() === GLOBAL_MEMORY_PROJECT_KEY ? 'global' : 'project'
}

function extractOriginThreadIdFromTags(raw = '[]') {
  const tags = parseTagsJson(raw)
  for (const tag of tags) {
    if (!tag.startsWith(TERMINAL_THREAD_TAG_PREFIX)) continue
    const value = tag.slice(TERMINAL_THREAD_TAG_PREFIX.length).trim()
    if (value) return value
  }
  return ''
}

function classifyDurableMemorySource(row = null) {
  const source = String(row?.source || '').trim().toLowerCase()
  const tags = parseTagsJson(row?.tags)
  if (source === 'user' || source === 'user_memory') return 'user_memory'
  if (source === 'web_ingest' || source === 'reference_note') return 'reference_note'
  if (source === 'workspace_event' || source === 'tool_result') return 'workspace_event'
  if (source === 'terminal_summary') return 'terminal_summary'
  if (tags.includes('terminal_summary')) return 'terminal_summary'
  if (source === 'validated_decision') return 'validated_decision'
  if (source === 'auto_log') {
    if (tags.includes('file_write')) return 'workspace_event'
    if (tags.includes('decision')) return 'validated_decision'
    return ''
  }
  return ''
}

function migrateToThreadLocalContinuityAndDurableMemory(db) {
  ensureThreadContinuityTables(db)
  db.prepare('DELETE FROM continuity_snapshots').run()
  db.prepare('DELETE FROM continuity_facts').run()
  db.prepare('DELETE FROM continuity_invariants').run()
  db.prepare('DELETE FROM thread_continuity_state').run()
  db.prepare('DELETE FROM thread_continuity_turns').run()
  db.prepare('DELETE FROM openai_thread_state').run()

  const rows = db.prepare('SELECT id, source, tags FROM nodes').all()
  const updateStmt = db.prepare('UPDATE nodes SET source = ? WHERE id = ?')
  const deleteStmt = db.prepare('DELETE FROM nodes WHERE id = ?')
  const tx = db.transaction(() => {
    for (const row of rows) {
      const nextSource = classifyDurableMemorySource(row)
      if (!nextSource) {
        deleteStmt.run(String(row.id || ''))
        continue
      }
      updateStmt.run(nextSource, String(row.id || ''))
    }
  })
  tx()
}

function migrateTerminalSummaryMemorySources(db) {
  const rows = db.prepare('SELECT id, source, tags FROM nodes').all()
  const updateStmt = db.prepare('UPDATE nodes SET source = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const row of rows) {
      const currentSource = String(row?.source || '').trim().toLowerCase()
      const nextSource = classifyDurableMemorySource(row)
      if (nextSource !== 'terminal_summary' || currentSource === 'terminal_summary') continue
      updateStmt.run('terminal_summary', String(row.id || ''))
    }
  })
  tx()
}

function migrateScopedMemoryNodes(db) {
  db.exec(`
    UPDATE nodes
    SET scope = CASE
      WHEN project = '${GLOBAL_MEMORY_PROJECT_KEY}' THEN 'global'
      ELSE 'project'
    END
    WHERE scope IS NULL
      OR TRIM(scope) = ''
      OR (project = '${GLOBAL_MEMORY_PROJECT_KEY}' AND scope != 'global')
  `)
  db.exec(`UPDATE nodes SET durability = 'standard' WHERE durability IS NULL OR TRIM(durability) = ''`)
  db.exec('UPDATE nodes SET confidence = 0.5 WHERE confidence IS NULL')
  db.exec(`
    UPDATE nodes
    SET last_used_at = COALESCE(NULLIF(last_accessed, 0), updated_at, created_at, 0)
    WHERE last_used_at IS NULL OR last_used_at <= 0
  `)

  const rows = db.prepare(`
    SELECT id, source, tags, thread_id, origin_thread_id, project, scope
    FROM nodes
  `).all()
  const updateScope = db.prepare('UPDATE nodes SET scope = ? WHERE id = ?')
  const updateThreadMetadata = db.prepare('UPDATE nodes SET thread_id = ?, origin_thread_id = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const row of rows) {
      const storedScope = String(row?.scope || '')
      const derivedScope = deriveNodeScope(row)
      if (storedScope !== derivedScope) {
        updateScope.run(derivedScope, String(row.id || ''))
      }

      const normalizedThreadId = normalizeNullableText(row?.thread_id)
      const currentOriginThreadId = normalizeNullableText(row?.origin_thread_id)
      let nextOriginThreadId = currentOriginThreadId
      const source = String(row?.source || '').trim().toLowerCase()
      if (!nextOriginThreadId) {
        const originThreadId = extractOriginThreadIdFromTags(row?.tags)
        if (originThreadId && (source === 'terminal_summary' || parseTagsJson(row?.tags).includes('terminal_summary'))) {
          nextOriginThreadId = originThreadId
        }
      }

      if (normalizedThreadId !== row?.thread_id || nextOriginThreadId !== row?.origin_thread_id) {
        updateThreadMetadata.run(normalizedThreadId, nextOriginThreadId, String(row.id || ''))
      }
    }
  })
  tx()
}

export function runMigrations(db) {
  let version = getUserVersion(db)

  if (version < 1) {
    ensureCoreTables(db)
    version = 1
    setUserVersion(db, version)
  }

  if (version < 2) {
    ensureNodeColumns(db)
    version = 2
    setUserVersion(db, version)
  }

  if (version < 3) {
    ensureWorkspaceTables(db)
    version = 3
    setUserVersion(db, version)
  }

  if (version < 4) {
    ensureMoaTables(db)
    version = 4
    setUserVersion(db, version)
  }

  if (version < 5) {
    ensureMoaTables(db)
    ensureMoaColumns(db)
    version = 5
    setUserVersion(db, version)
  }

  if (version < 6) {
    ensureContinuityTables(db)
    version = 6
    setUserVersion(db, version)
  }

  if (version < 7) {
    ensureWorkspaceTables(db)
    ensureAttachmentColumns(db)
    version = 7
    setUserVersion(db, version)
  }

  if (version < 8) {
    ensureOpenAIProviderTables(db)
    version = 8
    setUserVersion(db, version)
  }

  if (version < 9) {
    ensureOpenAIProviderTables(db)
    ensureOpenAIProviderColumns(db)
    version = 9
    setUserVersion(db, version)
  }

  if (version < 10) {
    ensureWorkspaceTables(db)
    ensureWorkspaceThreadColumns(db)
    version = 10
    setUserVersion(db, version)
  }

  if (version < 11) {
    ensureThreadContinuityTables(db)
    ensureOpenAIProviderTables(db)
    ensureOpenAIProviderColumns(db)
    migrateToThreadLocalContinuityAndDurableMemory(db)
    version = 11
    setUserVersion(db, version)
  }

  if (version < 12) {
    ensureTerminalSessionArchiveTable(db)
    ensureTerminalSessionArchiveColumns(db)
    version = 12
    setUserVersion(db, version)
  }

  if (version < 13) {
    migrateTerminalSummaryMemorySources(db)
    version = 13
    setUserVersion(db, version)
  }

  if (version < 14) {
    ensureCoreTables(db)
    ensureNodeColumns(db)
    migrateScopedMemoryNodes(db)
    version = 14
    setUserVersion(db, version)
  }

  if (version < 15) {
    ensureProviderBudgetTables(db)
    version = 15
    setUserVersion(db, version)
  }

  if (version < 16) {
    ensureProviderBudgetTables(db)
    ensureProviderBudgetColumns(db)
    version = 16
    setUserVersion(db, version)
  }

  if (version < 17) {
    ensureCoreTables(db)
    ensureNodeColumns(db)
    ensureArtifactColumns(db)
    ensureWorkspaceTables(db)
    ensureMoaTables(db)
    version = 17
    setUserVersion(db, version)
  }

  if (version < 18) {
    ensureWorkspaceTables(db)
    ensureAgentRunTables(db)
    version = 18
    setUserVersion(db, version)
  }

  if (version < 19) {
    ensureAgentRunTables(db)
    version = 19
    setUserVersion(db, version)
  }

  if (version < 20) {
    ensureAgentRunTables(db)
    version = 20
    setUserVersion(db, version)
  }

  if (version < 21) {
    ensureWorkspaceTables(db)
    ensureAgentRunTables(db)
    ensureMoaTables(db)
    ensureMoaColumns(db)
    migrateLegacyMoaTransactions(db)
    version = 21
    setUserVersion(db, version)
  }

  if (version < 22) {
    ensureAgentRunTables(db)
    version = 22
    setUserVersion(db, version)
  }

  if (version < 23) {
    ensureAgentRunTables(db)
    version = 23
    setUserVersion(db, version)
  }

  if (version < 24) {
    db.transaction(() => {
      ensureAgentRunTables(db)
      ensureAgentConversationTables(db)
      setUserVersion(db, 24)
    })()
    version = 24
  }

  if (version < 25) {
    db.transaction(() => {
      ensureAgentConversationTables(db)
      ensureAgentConversationMailboxDeliveryColumns(db)
      setUserVersion(db, 25)
    })()
    version = 25
  }

  if (version < 26) {
    db.transaction(() => {
      ensureAgentConversationTables(db)
      ensureAgentPromotionRetentionTables(db)
      setUserVersion(db, 26)
    })()
    version = 26
  }

  if (version < 27) {
    db.transaction(() => {
      ensureAgentConversationTables(db)
      ensureAgentConversationLegacyForensicsTable(db)
      migrateLegacyAgentChildConversations(db)
      setUserVersion(db, 27)
    })()
    version = 27
  }

  if (version < 28) {
    db.transaction(() => {
      ensureWorkspaceTables(db)
      ensureCanonicalChatEventColumns(db)
      backfillLegacyCanonicalChatEventColumns(db)
      setUserVersion(db, 28)
    })()
    version = 28
  }

  if (version < 29) {
    db.transaction(() => {
      ensureWorkspaceTables(db)
      ensureWorkspaceThreadColumns(db)
      setUserVersion(db, 29)
    })()
    version = 29
  }

  ensureCoreTables(db)
  ensureNodeColumns(db)
  ensureArtifactColumns(db)
  migrateScopedMemoryNodes(db)
  ensureWorkspaceTables(db)
  ensureWorkspaceThreadColumns(db)
  ensureCanonicalChatEventColumns(db)
  ensureAttachmentColumns(db)
  ensureMoaAgentMemoryTable(db)
  ensureContinuityTables(db)
  ensureThreadContinuityTables(db)
  ensureOpenAIProviderTables(db)
  ensureProviderBudgetTables(db)
  ensureProviderBudgetColumns(db)
  ensureOpenAIProviderColumns(db)
  ensureTerminalSessionArchiveTable(db)
  ensureTerminalSessionArchiveColumns(db)
  ensureAgentRunTables(db)
  ensureAgentConversationTables(db)
  ensureAgentConversationMailboxDeliveryColumns(db)
  ensureAgentPromotionRetentionTables(db)
  ensureAgentConversationLegacyForensicsTable(db)
  ensureIndexes(db)

  if (version !== SCHEMA_VERSION) {
    setUserVersion(db, SCHEMA_VERSION)
  }
}
