import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const INVENTORY_PATH = 'config/public-documents.json'
const ALLOWED_AUDIENCES = new Set(['users', 'contributors', 'reference', 'policy'])
const INTERNAL_PATH_SEGMENTS = new Set([
  'audits',
  'dev-docs',
  'evidence',
  'implementation-plans',
  'investigations',
  'rehearsals',
])
const INTERNAL_FILE_NAMES = new Set(['design.md', 'plan.md'])
const INTERNAL_CONTENT_PATTERNS = [
  /partner center submission hold/iu,
  /does not authorize[^\n]{0,120}(?:certification submission|public release)/iu,
  /private (?:update )?rehearsal/iu,
  /primary inspiration source|secondary polish reference|user remains the arbitrator|codex-style/iu,
]

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function toPosix(value) {
  return String(value || '').split(path.sep).join('/')
}

function walkMarkdownFiles(directory, repoRoot, files) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkMarkdownFiles(absolutePath, repoRoot, files)
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(toPosix(path.relative(repoRoot, absolutePath)))
    }
  }
}

export function collectPublicMarkdownPaths(repoRoot = resolveRepoRoot()) {
  const files = fs.readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)

  walkMarkdownFiles(path.join(repoRoot, 'docs'), repoRoot, files)
  return files.sort()
}

function readInventory(repoRoot) {
  const inventoryFile = path.join(repoRoot, INVENTORY_PATH)
  if (!fs.existsSync(inventoryFile)) {
    return { error: `${INVENTORY_PATH} is missing.`, documents: [] }
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'))
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed?.documents)) {
      return { error: `${INVENTORY_PATH} must use schemaVersion 1 and contain a documents array.`, documents: [] }
    }
    return { error: '', documents: parsed.documents }
  } catch (error) {
    return { error: `${INVENTORY_PATH} is invalid JSON: ${error.message}`, documents: [] }
  }
}

function usesInternalPath(relativePath) {
  const normalized = toPosix(relativePath).toLowerCase()
  const segments = normalized.split('/')
  return INTERNAL_FILE_NAMES.has(segments.at(-1))
    || segments.some((segment) => INTERNAL_PATH_SEGMENTS.has(segment))
}

function containsInternalReleaseLanguage(absolutePath) {
  const source = fs.readFileSync(absolutePath, 'utf8')
  return INTERNAL_CONTENT_PATTERNS.some((pattern) => pattern.test(source))
}

export function validatePublicDocumentInventory({ repoRoot = resolveRepoRoot() } = {}) {
  const issues = []
  const publicPaths = collectPublicMarkdownPaths(repoRoot)
  const publicPathSet = new Set(publicPaths)
  const inventory = readInventory(repoRoot)
  if (inventory.error) return [inventory.error]

  const entries = new Map()
  for (const document of inventory.documents) {
    const relativePath = toPosix(document?.path).replace(/^\.\//u, '')
    if (!relativePath) {
      issues.push(`${INVENTORY_PATH} contains an entry without a path.`)
      continue
    }
    if (entries.has(relativePath)) {
      issues.push(`${relativePath} is registered more than once.`)
      continue
    }
    entries.set(relativePath, document)

    if (!ALLOWED_AUDIENCES.has(document?.audience)) {
      issues.push(`${relativePath} has unsupported audience "${document?.audience || ''}".`)
    }
    if (String(document?.purpose || '').trim().length < 12) {
      issues.push(`${relativePath} must declare a meaningful public purpose.`)
    }
    if (!publicPathSet.has(relativePath)) {
      issues.push(`${relativePath} is registered but does not exist.`)
    }
  }

  for (const relativePath of publicPaths) {
    if (!entries.has(relativePath)) {
      issues.push(`${relativePath} is public Markdown but is missing from ${INVENTORY_PATH}.`)
    }
    if (usesInternalPath(relativePath)) {
      issues.push(`${relativePath} uses an internal-only documentation path or filename.`)
    }
    if (containsInternalReleaseLanguage(path.join(repoRoot, relativePath))) {
      issues.push(`${relativePath} contains internal release-control language.`)
    }
  }

  return issues.sort((left, right) => left.localeCompare(right))
}

function main() {
  const issues = validatePublicDocumentInventory()
  if (issues.length > 0) {
    console.error(`Public documentation hygiene failed with ${issues.length} issue(s):`)
    for (const issue of issues) console.error(`- ${issue}`)
    process.exitCode = 1
    return
  }

  console.log(`Public documentation hygiene passed (${collectPublicMarkdownPaths().length} documents).`)
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isEntrypoint) main()
