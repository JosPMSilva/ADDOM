/**
 * agent-memory.mjs
 *
 * Per-project, per-role memory store for MoA agents.
 * Persists key observations, summaries, and context fragments
 * across sessions so agents can build on prior work.
 *
 * Storage is app-owned SQLite state keyed by workspace project and role scope.
 */

import {
    clearAgentMemory,
    clearProjectAgentMemory,
    listAgentMemoryScopes,
    readAgentMemory,
    writeAgentMemory,
} from './agent-memory-store.mjs'

const MAX_ENTRY_CHARS = 2000

function cleanString(value) {
    return String(value ?? '').trim()
}

function normalizeMemoryDescriptor(input = '') {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
        const ancestry = input.ancestry && typeof input.ancestry === 'object'
            ? input.ancestry
            : null
        return {
            roleId: cleanString(input.roleId || input.id),
            roleName: cleanString(input.roleName || input.name),
            specialty: cleanString(input.specialty),
            taskType: cleanString(input.taskType || input.task_type),
            templateId: cleanString(input.templateId),
            templateLabel: cleanString(input.templateLabel),
            ancestry: ancestry
                ? {
                    kind: cleanString(ancestry.kind),
                    sourceId: cleanString(ancestry.sourceId),
                    sourceLabel: cleanString(ancestry.sourceLabel),
                }
                : null,
        }
    }
    return {
        roleId: cleanString(input),
        roleName: '',
        specialty: '',
        taskType: '',
        templateId: '',
        templateLabel: '',
        ancestry: null,
    }
}

function familyScopeKey(descriptor = {}) {
    const ancestry = descriptor?.ancestry && typeof descriptor.ancestry === 'object'
        ? descriptor.ancestry
        : null
    const sourceId = cleanString(ancestry?.sourceId || descriptor?.templateId)
    if (sourceId) return `family__${sourceId}`
    const sourceLabel = cleanString(ancestry?.sourceLabel || descriptor?.templateLabel)
    if (sourceLabel) return `family__${sourceLabel}`
    return ''
}

export function deriveMemoryScopeKeys(input = '') {
    const descriptor = normalizeMemoryDescriptor(input)
    const keys = []
    if (descriptor.roleId) keys.push(descriptor.roleId)
    else if (descriptor.roleName) keys.push(descriptor.roleName)
    const familyKey = familyScopeKey(descriptor)
    if (familyKey) keys.push(familyKey)
    if (descriptor.specialty) keys.push(`specialty__${descriptor.specialty}`)
    if (descriptor.taskType) keys.push(`task_type__${descriptor.taskType}`)
    return Array.from(new Set(keys.map((value) => cleanString(value)).filter(Boolean)))
}

/* ------------------------------------------------------------------ */
/*  Read / Write                                                       */
/* ------------------------------------------------------------------ */

/**
 * Read all memory entries for a role in a project.
 *
 * @param {string} projectFolder
 * @param {string} roleId
 * @returns {Array<object>}
 */
export function readMemory(projectFolder, roleId) {
    if (roleId && typeof roleId === 'object' && !Array.isArray(roleId)) {
        return readAgentMemory(projectFolder, deriveMemoryScopeKeys(roleId))
    }
    return readAgentMemory(projectFolder, [roleId])
}

/**
 * Write a new memory entry for a role.
 *
 * @param {string} projectFolder
 * @param {string} roleId
 * @param {object} entry
 * @param {string} entry.summary – Short summary of what was learned/done
 * @param {string} entry.context – Relevant context or key findings
 * @param {string} entry.taskInstruction – The original task instruction
 */
export function writeMemory(projectFolder, roleId, entry) {
    const newEntry = {
        timestamp: new Date().toISOString(),
        summary: cleanString(entry?.summary).slice(0, MAX_ENTRY_CHARS),
        context: cleanString(entry?.context).slice(0, MAX_ENTRY_CHARS),
        taskInstruction: cleanString(entry?.taskInstruction).slice(0, 500),
    }
    return writeAgentMemory(projectFolder, deriveMemoryScopeKeys(roleId), newEntry)
}

/**
 * Build a formatted memory context string for injection into an agent.
 *
 * @param {string} projectFolder
 * @param {string} roleId
 * @param {{ maxEntries?: number, maxChars?: number }} options
 * @returns {string}
 */
export function buildMemoryContext(projectFolder, roleId, {
    maxEntries = 10,
    maxChars = 2000,
} = {}) {
    const entries = readMemory(projectFolder, roleId)
    if (entries.length === 0) return ''

    // Take the most recent entries
    const recent = entries.slice(-maxEntries)

    const lines = ['## Agent Memory (from previous sessions)\n']
    for (const entry of recent) {
        const date = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'unknown'
        lines.push(`### ${date} — ${entry.summary || 'Session note'}`)
        if (entry.context) lines.push(entry.context)
        lines.push('')
    }

    const full = lines.join('\n')
    return full.length > maxChars
        ? full.slice(0, maxChars) + '\n... (memory truncated)'
        : full
}

/**
 * Clear all memory for a specific role in a project.
 *
 * @param {string} projectFolder
 * @param {string} roleId
 */
export function clearMemory(projectFolder, roleId) {
    return clearAgentMemory(projectFolder, roleId)
}

export function clearAllMemory(projectFolder) {
    return clearProjectAgentMemory(projectFolder)
}

/**
 * List all roles that have memory in a project.
 *
 * @param {string} projectFolder
 * @returns {Array<{ roleId: string, entryCount: number, lastUpdated: string }>}
 */
export function listMemoryRoles(projectFolder) {
    return listAgentMemoryScopes(projectFolder)
}

