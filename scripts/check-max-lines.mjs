import fs from 'node:fs'
import path from 'node:path'

const INCLUDE_TESTS_AND_SCRIPTS = process.env.CHECK_TESTS_AND_SCRIPTS === '1'
const SOURCE_MAX_FILE_LINES = Number(process.env.MAX_FILE_LINES || 800)
const LEGACY_MAX_FILE_LINES = Number(process.env.LEGACY_MAX_FILE_LINES || 6000)
const STRICT_MAX_LINES = process.env.STRICT_MAX_LINES === '1'

const SCAN_ROOTS = INCLUDE_TESTS_AND_SCRIPTS ? ['src', 'tests', 'scripts'] : ['src']
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.css'])
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.vite', 'coverage'])
const GENERATED_PATH_PREFIXES = [
  'src/common/api-clients/generated/',
  'src/preload/generated/',
  'src/renderer/styles/phosphor/',
]

// Temporary source baseline. Each entry must include a reason and a current cap
// so legacy hotspots cannot keep growing while follow-up decomposition proceeds.
const GRANDFATHERED_MAX_LINES = new Map([
  ['src/renderer/content/instructions-catalog-i18n.mjs', { max: 1176, reason: 'Legacy localized catalog hotspot pending follow-up decomposition.' }],
  ['src/renderer/store/editor-git-diff-store.js', { max: 1043, reason: 'Legacy source hotspot pending follow-up decomposition.' }],
  ['src/renderer/components/terminal/use-xterm-viewport.js', { max: 1034, reason: 'Legacy terminal viewport hotspot pending follow-up decomposition.' }],
  ['src/renderer/components/CommandPalette.jsx', { max: 865, reason: 'Legacy source hotspot pending follow-up decomposition.' }],
  ['src/renderer/components/terminal/TerminalViewport.jsx', { max: 885, reason: 'Legacy terminal surface hotspot pending follow-up decomposition.' }],
])

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function collectFiles(rootDir, out) {
  if (!fs.existsSync(rootDir)) return
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      collectFiles(absolutePath, out)
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (!CODE_EXTENSIONS.has(ext)) continue
    out.push(absolutePath)
  }
}

function countLines(text) {
  if (!text) return 0
  return text.split(/\r?\n/).length
}

function isGeneratedFile(relativePath) {
  const normalized = normalizeRelativePath(relativePath)
  return GENERATED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function getMaxLinesForPath(relativePath) {
  if (relativePath.startsWith('src/')) return SOURCE_MAX_FILE_LINES
  return LEGACY_MAX_FILE_LINES
}

const repoRoot = process.cwd()
const files = []
for (const scanRoot of SCAN_ROOTS) {
  collectFiles(path.join(repoRoot, scanRoot), files)
}

const violations = []
const generatedHits = []
const grandfatheredHits = []
const overLimitSet = new Set()

for (const absolutePath of files) {
  const relativePath = normalizeRelativePath(path.relative(repoRoot, absolutePath))
  const content = fs.readFileSync(absolutePath, 'utf8')
  const lines = countLines(content)
  const maxLines = getMaxLinesForPath(relativePath)
  if (lines <= maxLines) continue
  overLimitSet.add(relativePath)
  if (isGeneratedFile(relativePath)) {
    generatedHits.push({ relativePath, lines, maxLines })
    continue
  }
  const grandfathered = GRANDFATHERED_MAX_LINES.get(relativePath)
  const grandfatheredMax = Number(grandfathered?.max)
  const grandfatheredReason = String(grandfathered?.reason || '').trim()
  if (
    !STRICT_MAX_LINES
    && Number.isFinite(grandfatheredMax)
    && grandfatheredReason
    && lines <= grandfatheredMax
  ) {
    grandfatheredHits.push({ relativePath, lines, maxLines, grandfatheredMax, reason: grandfatheredReason })
    continue
  }
  violations.push({ relativePath, lines, maxLines })
}

if (violations.length > 0) {
  console.error('Line count limit check failed.')
  for (const row of violations.sort((a, b) => b.lines - a.lines)) {
    console.error(`- ${row.relativePath}: ${row.lines} lines (max ${row.maxLines})`)
  }
  if (!STRICT_MAX_LINES && grandfatheredHits.length > 0) {
    console.error('')
    console.error('Grandfathered source files (allowed temporarily):')
    for (const row of grandfatheredHits.sort((a, b) => b.lines - a.lines)) {
      console.error(`- ${row.relativePath}: ${row.lines} lines (cap ${row.grandfatheredMax}) - ${row.reason}`)
    }
  }
  if (generatedHits.length > 0) {
    console.error('')
    console.error('Generated over-limit files (reported separately):')
    for (const row of generatedHits.sort((a, b) => b.lines - a.lines)) {
      console.error(`- ${row.relativePath}: ${row.lines} lines (max ${row.maxLines})`)
    }
  }
  process.exit(1)
}

const staleGrandfathered = [...GRANDFATHERED_MAX_LINES.keys()].filter((relativePath) => !overLimitSet.has(relativePath))

if (grandfatheredHits.length > 0) {
  console.log(
    `Line count check passed with ${grandfatheredHits.length} grandfathered source file(s) still above ${SOURCE_MAX_FILE_LINES}.`,
  )
} else {
  console.log(`Line count check passed. No scanned files above their configured line limits.`)
}

if (generatedHits.length > 0) {
  console.log('Generated over-limit files (reported separately):')
  for (const row of generatedHits.sort((a, b) => b.lines - a.lines)) {
    console.log(`- ${row.relativePath}: ${row.lines} lines (max ${row.maxLines})`)
  }
}

if (staleGrandfathered.length > 0) {
  console.log('Stale grandfathered entries (now <= limit, safe to remove from allowlist):')
  for (const relativePath of staleGrandfathered.sort()) {
    console.log(`- ${relativePath}`)
  }
}
