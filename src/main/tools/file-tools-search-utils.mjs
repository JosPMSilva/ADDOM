import path from 'node:path'

import {
  hasHostFileAccess,
  isPathWithinProjectRoot,
  statIfExists,
  toPosixRel,
} from './file-tools-path-utils.mjs'

const MAX_SEARCH_REGEX_PATTERN_LENGTH = 240
const DEFAULT_IGNORED_NAMES = new Set(['.git', 'node_modules', '.DS_Store', 'dist', '__pycache__'])

function escapeRegex(source) {
  return String(source).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readRegexQuantifierLength(pattern, index) {
  const ch = pattern[index]
  if (ch === '*' || ch === '+' || ch === '?') return 1
  if (ch !== '{') return 0
  const closeIndex = pattern.indexOf('}', index + 1)
  if (closeIndex === -1) return 0
  const body = pattern.slice(index + 1, closeIndex).trim()
  if (!/^\d+(,\d*)?$/.test(body)) return 0
  return (closeIndex - index) + 1
}

function getUnsafeRegexReason(pattern) {
  const source = String(pattern || '')
  if (!source) return ''
  if (source.length > MAX_SEARCH_REGEX_PATTERN_LENGTH) {
    return `pattern exceeds ${MAX_SEARCH_REGEX_PATTERN_LENGTH} characters`
  }

  const groupStack = []
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '\\') {
      const escaped = source[i + 1] || ''
      if (/[1-9]/.test(escaped)) return 'backreferences are not allowed in file search regexes'
      i += 1
      continue
    }
    if (ch === '[') {
      for (i += 1; i < source.length; i += 1) {
        if (source[i] === '\\') {
          i += 1
          continue
        }
        if (source[i] === ']') break
      }
      continue
    }
    if (ch === '(') {
      groupStack.push({ hasInnerQuantifier: false, hasAlternation: false })
      continue
    }
    if (ch === '|') {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasAlternation = true
      }
      continue
    }
    if (ch === ')') {
      const group = groupStack.pop()
      const quantifierLength = readRegexQuantifierLength(source, i + 1)
      if (group && quantifierLength > 0 && (group.hasInnerQuantifier || group.hasAlternation)) {
        return 'nested or alternated quantified groups are not allowed'
      }
      continue
    }
    const quantifierLength = readRegexQuantifierLength(source, i)
    if (quantifierLength > 0) {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasInnerQuantifier = true
      }
      i += quantifierLength - 1
    }
  }

  return ''
}

export function buildSafeSearchRegex(pattern, fieldLabel = 'pattern') {
  const rawPattern = String(pattern ?? '')
  try {
    const unsafeReason = getUnsafeRegexReason(rawPattern)
    if (unsafeReason) {
      throw new Error(`Unsafe regex for ${fieldLabel}: ${unsafeReason}. Refine the pattern or use a simpler literal search.`)
    }
    return new RegExp(rawPattern, 'gi')
  } catch (error) {
    if (error instanceof SyntaxError) {
      return new RegExp(escapeRegex(rawPattern), 'gi')
    }
    throw error
  }
}

export function wildcardToRegexSource(pattern, { allowSlash = false } = {}) {
  let out = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]
    const next = pattern[i + 1]
    if (ch === '*') {
      if (next === '*') {
        out += '.*'
        i += 1
      } else {
        out += allowSlash ? '.*' : '[^/]*'
      }
      continue
    }
    if (ch === '?') {
      out += allowSlash ? '.' : '[^/]'
      continue
    }
    out += escapeRegex(ch)
  }
  return out
}

function compileGitignoreRule(rawLine) {
  let line = String(rawLine || '').trim()
  if (!line || line.startsWith('#')) return null

  let negate = false
  if (line.startsWith('!')) {
    negate = true
    line = line.slice(1).trim()
    if (!line) return null
  }

  let dirOnly = false
  if (line.endsWith('/')) {
    dirOnly = true
    line = line.slice(0, -1)
  }

  let anchored = false
  if (line.startsWith('/')) {
    anchored = true
    line = line.slice(1)
  }

  line = toPosixRel(line)
  if (!line) return null

  const hasSlash = line.includes('/')
  if (!hasSlash) {
    return {
      negate,
      dirOnly,
      scope: 'basename',
      regex: new RegExp(`^${wildcardToRegexSource(line)}$`, 'i'),
    }
  }

  const src = wildcardToRegexSource(line)
  const prefix = anchored ? '^' : '(^|.*/)'
  return {
    negate,
    dirOnly,
    scope: 'path',
    regex: new RegExp(`${prefix}${src}$`, 'i'),
  }
}

async function createGitignoreMatcher(fs, projectRoot) {
  const gitignorePath = path.join(projectRoot, '.gitignore')
  let text = ''
  try {
    const stat = await statIfExists(fs, gitignorePath)
    if (stat?.isFile() && stat.size <= 512_000) {
      text = await fs.readFile(gitignorePath, 'utf8')
    }
  } catch {
    text = ''
  }
  const rules = text
    .split(/\r?\n/g)
    .map(compileGitignoreRule)
    .filter(Boolean)

  if (rules.length === 0) return () => false

  return (relPath, isDir) => {
    const rel = toPosixRel(relPath)
    if (!rel) return false
    const base = path.posix.basename(rel)
    let ignored = false
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue
      const matched = rule.scope === 'basename'
        ? rule.regex.test(base)
        : rule.regex.test(rel)
      if (!matched) continue
      ignored = !rule.negate
    }
    return ignored
  }
}

export async function createPathFilter(fs, projectRoot, options = {}) {
  const rootPath = String(options?.rootPath || projectRoot || '').trim() || projectRoot
  if (hasHostFileAccess(options) && !isPathWithinProjectRoot(projectRoot, rootPath)) {
    return (_fullPath, entryName) => DEFAULT_IGNORED_NAMES.has(entryName)
  }
  const gitignoreMatch = await createGitignoreMatcher(fs, projectRoot)
  return (fullPath, entryName, isDir) => {
    if (DEFAULT_IGNORED_NAMES.has(entryName)) return true
    const rel = toPosixRel(path.relative(projectRoot, fullPath))
    return gitignoreMatch(rel, isDir)
  }
}
