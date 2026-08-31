import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NATIVE_AGENT_CONTRACT_VERSION = 3
const CATALOG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skill-catalog.json')

const NATIVE_AGENT_OPERATING_CONTRACT = [
  'Operational contract:',
  '- Inspect before asserting. Distinguish confirmed facts, reasoned inferences, and unresolved uncertainty.',
  '- Stay scoped, preserve unrelated work and local data, and use only tools and permissions actually available.',
  '- Reviews and diagnoses are read-only unless implementation is requested. For authorized work, make the smallest complete change.',
  '',
  'Execution loop:',
  '1. Orient to instructions, ownership, source, tests, and current changes.',
  '2. Trace the real control flow or evidence path; rank consequential issues first.',
  '3. Recommend or implement focused changes without speculative abstractions.',
  '4. Run the narrowest authoritative checks, broadening with risk.',
  '',
  'Output contract:',
  '- Lead with the outcome or highest-priority finding and cite concrete evidence.',
  '- Separate completed work from recommendations; report checks and residual risk.',
  '- If evidence or authority is missing, name the blocker and the next decisive step.',
].join('\n')

let cachedRows = null

function clean(value) {
  return String(value ?? '').trim()
}

function loadRows() {
  if (cachedRows) return cachedRows
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
  cachedRows = Array.isArray(raw?.skills) ? raw.skills : []
  return cachedRows
}

function buildDescription(row = {}) {
  const description = clean(row.description)
  if (/\buse when\b/i.test(description)) return description
  const cue = clean(row.recommendedUseCases?.[0])
  if (!cue) return description
  return `${description.replace(/[.\s]+$/, '')}. Use when ${cue.charAt(0).toLowerCase()}${cue.slice(1)}.`
}

function buildSystemPrompt(row = {}) {
  const prompt = clean(row.defaultSystemPrompt)
  if (!prompt || row.source !== 'addom/built-in') return prompt
  if (prompt.includes('Operational contract:')) return prompt
  return `${prompt}\n\n${NATIVE_AGENT_OPERATING_CONTRACT}`
}

function normalizeTemplate(row = {}) {
  const version = Number.isFinite(Number(row.version))
    ? Math.max(1, Math.round(Number(row.version)))
    : 1
  return {
    id: clean(row.id),
    version: row.source === 'addom/built-in'
      ? Math.max(version, NATIVE_AGENT_CONTRACT_VERSION)
      : version,
    category: clean(row.category).toLowerCase() || 'general',
    tags: Array.isArray(row.tags)
      ? row.tags.map((tag) => clean(tag).toLowerCase()).filter(Boolean).slice(0, 20)
      : [],
    label: clean(row.label),
    description: buildDescription(row),
    defaultName: clean(row.defaultName),
    defaultSystemPrompt: buildSystemPrompt(row),
    recommendedUseCases: Array.isArray(row.recommendedUseCases)
      ? row.recommendedUseCases.map((item) => clean(item)).filter(Boolean).slice(0, 12)
      : [],
    suggestedCanWriteFiles: !!row.suggestedCanWriteFiles,
    suggestedProviderId: clean(row.suggestedProviderId),
    suggestedModel: clean(row.suggestedModel),
    source: clean(row.source) || 'addom/built-in',
  }
}

export function listRoleTemplates() {
  return loadRows().map((row) => normalizeTemplate(row)).filter((row) => row.id)
}

export function getRoleTemplateById(templateId) {
  const id = clean(templateId).toLowerCase()
  if (!id) return null
  const template = loadRows().find((row) => clean(row.id).toLowerCase() === id)
  return template ? normalizeTemplate(template) : null
}
