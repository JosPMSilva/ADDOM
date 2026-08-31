import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const repoRoot = process.cwd()
const docsRoot = path.join(repoRoot, 'docs')
const extraMarkdownFiles = [
  path.join(repoRoot, 'README.md'),
  path.join(repoRoot, 'CONTRIBUTING.md'),
  path.join(repoRoot, 'CHANGELOG.md'),
  path.join(repoRoot, 'documentation_tasks.md'),
]

const issues = []
let totalLinksChecked = 0
const trackedRepoPaths = new Set(
  execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
    .split('\0')
    .filter(Boolean)
)

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function toRepoRelative(absolutePath) {
  return toPosix(path.relative(repoRoot, absolutePath))
}

function collectMarkdownFiles(rootDir, out) {
  if (!fs.existsSync(rootDir)) return
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      collectMarkdownFiles(absolutePath, out)
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.md')) continue
    out.push(absolutePath)
  }
}

function normalizeTarget(rawTarget) {
  let target = String(rawTarget || '').trim()
  if (!target) return ''
  if (target.startsWith('<') && target.endsWith('>') && target.length > 2) {
    target = target.slice(1, -1).trim()
  }

  const titleMatch = target.match(/^(\S+)\s+["'(].*$/)
  if (titleMatch) target = titleMatch[1]

  return target
}

function isExternalTarget(target) {
  return /^(https?:|mailto:|tel:)/i.test(target)
}

function slugifyHeading(text) {
  let slug = String(text || '').toLowerCase()
  slug = slug.replace(/<[^>]+>/g, '')
  slug = slug.replace(/[`*_~]/g, '')
  slug = slug.replace(/[^\p{L}\p{N}\-_ ]/gu, '')
  slug = slug.trim()
  slug = slug.replace(/\s+/g, '-')
  slug = slug.replace(/-+/g, '-')
  return slug
}

function extractAnchors(markdownPath) {
  const source = fs.readFileSync(markdownPath, 'utf8')
  const lines = source.split(/\r?\n/)
  const seen = new Map()
  const anchors = new Set()

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match) continue
    const baseSlug = slugifyHeading(match[2])
    if (!baseSlug) continue

    const count = seen.get(baseSlug) ?? 0
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`
    seen.set(baseSlug, count + 1)
    anchors.add(slug)
  }

  return anchors
}

const anchorCache = new Map()

function getAnchors(markdownPath) {
  if (!anchorCache.has(markdownPath)) {
    anchorCache.set(markdownPath, extractAnchors(markdownPath))
  }
  return anchorCache.get(markdownPath)
}

function resolveTargetFile(sourceFile, linkPathPart) {
  const targetPath = linkPathPart || ''
  if (!targetPath) return sourceFile
  if (targetPath.startsWith('/')) return path.join(repoRoot, targetPath.slice(1))
  return path.resolve(path.dirname(sourceFile), targetPath)
}

function isTrackedRepoTarget(resolvedPath) {
  const relativePath = path.relative(repoRoot, resolvedPath)
  if (
    !relativePath
    || relativePath === '..'
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    return false
  }

  const repoPath = toPosix(relativePath)
  if (trackedRepoPaths.has(repoPath)) return true
  if (!fs.statSync(resolvedPath).isDirectory()) return false
  const directoryPrefix = `${repoPath.replace(/\/+$/, '')}/`
  return [...trackedRepoPaths].some((trackedPath) => (
    trackedPath.startsWith(directoryPrefix)
  ))
}

function splitTarget(target) {
  const [pathAndQuery, anchorPart = ''] = target.split('#', 2)
  const [pathPart] = pathAndQuery.split('?', 2)
  return { pathPart, anchorPart }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function validateFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const lines = source.split(/\r?\n/)
  const linkPattern = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const match of line.matchAll(linkPattern)) {
      const raw = match[1]
      const normalized = normalizeTarget(raw)
      if (!normalized) continue
      if (isExternalTarget(normalized)) continue
      totalLinksChecked += 1

      const decodedTarget = safeDecode(normalized)
      const { pathPart, anchorPart } = splitTarget(decodedTarget)
      const resolvedPath = resolveTargetFile(filePath, pathPart)
      const resolvedExists = fs.existsSync(resolvedPath)

      if (!resolvedExists) {
        issues.push({
          type: 'missing_file',
          source: toRepoRelative(filePath),
          line: index + 1,
          target: normalized,
          resolved: toRepoRelative(resolvedPath)
        })
        continue
      }

      if (!isTrackedRepoTarget(resolvedPath)) {
        issues.push({
          type: 'untracked_file',
          source: toRepoRelative(filePath),
          line: index + 1,
          target: normalized,
          resolved: toRepoRelative(resolvedPath)
        })
        continue
      }

      if (!anchorPart) continue
      if (!resolvedPath.toLowerCase().endsWith('.md')) continue

      const expectedAnchor = safeDecode(anchorPart).toLowerCase()
      const anchors = getAnchors(resolvedPath)
      if (!anchors.has(expectedAnchor)) {
        issues.push({
          type: 'missing_anchor',
          source: toRepoRelative(filePath),
          line: index + 1,
          target: normalized,
          resolved: toRepoRelative(resolvedPath)
        })
      }
    }
  }
}

const markdownFiles = []
collectMarkdownFiles(docsRoot, markdownFiles)
for (const filePath of extraMarkdownFiles) {
  if (fs.existsSync(filePath)) markdownFiles.push(filePath)
}

if (markdownFiles.length === 0) {
  console.log('No markdown files found for validation.')
  process.exit(0)
}

for (const markdownPath of markdownFiles) {
  validateFile(markdownPath)
}

issues.sort((a, b) => {
  if (a.type !== b.type) return a.type.localeCompare(b.type)
  if (a.source !== b.source) return a.source.localeCompare(b.source)
  return a.line - b.line
})

console.log(`Checked markdown files: ${markdownFiles.length}`)
console.log(`Checked local links: ${totalLinksChecked}`)

if (issues.length > 0) {
  console.error(`Validation failed with ${issues.length} issue(s):`)
  for (const issue of issues) {
    console.error(`[${issue.type}] ${issue.source}:${issue.line} -> ${issue.target} (resolved: ${issue.resolved})`)
  }
  process.exit(1)
}

console.log('Docs link and anchor validation passed.')
