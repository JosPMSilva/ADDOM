import fs from 'fs'
import path from 'path'
import {
  fileExists,
  normalizeProjectRoot,
  safePath,
  samePath,
} from './editor-format-support.mjs'

const BIOME_CONFIG_FILES = [
  'biome.json',
  'biome.jsonc',
]
const CLANG_FORMAT_CONFIG_FILES = [
  '.clang-format',
  '_clang-format',
]
const CLANG_TIDY_CONFIG_FILES = [
  '.clang-tidy',
]
const CLANG_COMPILE_CONTEXT_FILES = [
  'compile_commands.json',
  'compile_flags.txt',
]
const RUFF_CONFIG_FILES = [
  '.ruff.toml',
  'ruff.toml',
  'pyproject.toml',
]
const JAVA_PROJECT_CONTEXT_FILES = [
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
]

function hasConfigInDirectory(dirPath = '', fileNames = [], matcher = null) {
  if (!dirPath || !Array.isArray(fileNames) || fileNames.length === 0) return ''
  for (const fileName of fileNames) {
    const candidatePath = path.join(dirPath, fileName)
    if (!fileExists(candidatePath)) continue
    if (typeof matcher === 'function' && matcher(candidatePath) !== true) continue
    return candidatePath
  }
  return ''
}

export function detectNearestConfigRoot(projectRoot = '', filePath = '', fileNames = [], matcher = null) {
  const workspaceRoot = normalizeProjectRoot(projectRoot)
  const rawFilePath = String(filePath || '').trim()
  if (!workspaceRoot || !rawFilePath) return ''

  const absPath = safePath(workspaceRoot, rawFilePath)
  let currentDir = path.dirname(absPath)

  while (currentDir && currentDir.startsWith(workspaceRoot)) {
    const matchedConfig = hasConfigInDirectory(currentDir, fileNames, matcher)
    if (matchedConfig) return currentDir
    if (samePath(currentDir, workspaceRoot)) break
    const parentDir = path.dirname(currentDir)
    if (!parentDir || samePath(parentDir, currentDir)) break
    currentDir = parentDir
  }

  return hasConfigInDirectory(workspaceRoot, fileNames, matcher) ? workspaceRoot : ''
}

function pyprojectHasRuffSection(configPath = '') {
  if (!/pyproject\.toml$/i.test(String(configPath || ''))) return true
  try {
    const content = fs.readFileSync(configPath, 'utf8')
    return /^\s*\[tool\.ruff(?:\.|\])/m.test(content)
  } catch {
    return false
  }
}

export function detectNearestBiomeConfigRoot(projectRoot = '', filePath = '') {
  return detectNearestConfigRoot(projectRoot, filePath, BIOME_CONFIG_FILES)
}

export function detectNearestClangFormatConfigRoot(projectRoot = '', filePath = '') {
  return detectNearestConfigRoot(projectRoot, filePath, CLANG_FORMAT_CONFIG_FILES)
}

export function detectNearestClangTidyConfigRoot(projectRoot = '', filePath = '') {
  return detectNearestConfigRoot(projectRoot, filePath, CLANG_TIDY_CONFIG_FILES)
}

export function detectNearestClangCompileContext(projectRoot = '', filePath = '') {
  const workspaceRoot = normalizeProjectRoot(projectRoot)
  const rawFilePath = String(filePath || '').trim()
  if (!workspaceRoot || !rawFilePath) return null

  const absPath = safePath(workspaceRoot, rawFilePath)
  let currentDir = path.dirname(absPath)

  const resolveCompileContextAtRoot = (rootDir = '') => {
    if (!rootDir) return null
    for (const fileName of CLANG_COMPILE_CONTEXT_FILES) {
      const candidatePath = path.join(rootDir, fileName)
      if (!fileExists(candidatePath)) continue
      return {
        root: rootDir,
        path: candidatePath,
        kind: fileName === 'compile_commands.json' ? 'compile_commands' : 'compile_flags',
      }
    }
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry?.isDirectory?.()) continue
        for (const fileName of CLANG_COMPILE_CONTEXT_FILES) {
          const candidatePath = path.join(rootDir, entry.name, fileName)
          if (!fileExists(candidatePath)) continue
          return {
            root: path.join(rootDir, entry.name),
            path: candidatePath,
            kind: fileName === 'compile_commands.json' ? 'compile_commands' : 'compile_flags',
          }
        }
      }
    } catch {
      // Ignore directory traversal failures during compile-context discovery.
    }
    return null
  }

  while (currentDir && currentDir.startsWith(workspaceRoot)) {
    const currentContext = resolveCompileContextAtRoot(currentDir)
    if (currentContext) return currentContext
    if (samePath(currentDir, workspaceRoot)) break
    const parentDir = path.dirname(currentDir)
    if (!parentDir || samePath(parentDir, currentDir)) break
    currentDir = parentDir
  }

  return resolveCompileContextAtRoot(workspaceRoot)
}

export function detectNearestRuffConfigRoot(projectRoot = '', filePath = '') {
  return detectNearestConfigRoot(projectRoot, filePath, RUFF_CONFIG_FILES, pyprojectHasRuffSection)
}

export function detectNearestCSharpProjectContext(projectRoot = '', filePath = '') {
  const workspaceRoot = normalizeProjectRoot(projectRoot)
  const rawFilePath = String(filePath || '').trim()
  if (!workspaceRoot || !rawFilePath) return null

  const absPath = safePath(workspaceRoot, rawFilePath)
  let currentDir = path.dirname(absPath)

  const resolveCSharpContextAtRoot = (rootDir = '') => {
    if (!rootDir) return null

    let entries = []
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true })
    } catch {
      return null
    }

    const csprojEntry = entries.find((entry) => (
      entry?.isFile?.() && path.extname(String(entry.name || '')).toLowerCase() === '.csproj'
    ))
    if (csprojEntry) {
      return {
        root: rootDir,
        path: path.join(rootDir, csprojEntry.name),
        kind: 'project',
      }
    }

    const solutionEntry = entries.find((entry) => (
      entry?.isFile?.() && path.extname(String(entry.name || '')).toLowerCase() === '.sln'
    ))
    if (solutionEntry) {
      return {
        root: rootDir,
        path: path.join(rootDir, solutionEntry.name),
        kind: 'solution',
      }
    }

    return null
  }

  while (currentDir && currentDir.startsWith(workspaceRoot)) {
    const currentContext = resolveCSharpContextAtRoot(currentDir)
    if (currentContext) return currentContext
    if (samePath(currentDir, workspaceRoot)) break
    const parentDir = path.dirname(currentDir)
    if (!parentDir || samePath(parentDir, currentDir)) break
    currentDir = parentDir
  }

  return resolveCSharpContextAtRoot(workspaceRoot)
}

export function detectNearestCSharpProjectRoot(projectRoot = '', filePath = '') {
  return detectNearestCSharpProjectContext(projectRoot, filePath)?.root || ''
}

export function detectNearestJavaProjectContext(projectRoot = '', filePath = '') {
  const workspaceRoot = normalizeProjectRoot(projectRoot)
  const rawFilePath = String(filePath || '').trim()
  if (!workspaceRoot || !rawFilePath) return null

  const absPath = safePath(workspaceRoot, rawFilePath)
  let currentDir = path.dirname(absPath)

  const resolveJavaContextAtRoot = (rootDir = '') => {
    if (!rootDir) return null
    for (const fileName of JAVA_PROJECT_CONTEXT_FILES) {
      const candidatePath = path.join(rootDir, fileName)
      if (!fileExists(candidatePath)) continue
      return {
        root: rootDir,
        path: candidatePath,
        kind: fileName === 'pom.xml' ? 'maven' : 'gradle',
      }
    }
    return null
  }

  while (currentDir && currentDir.startsWith(workspaceRoot)) {
    const currentContext = resolveJavaContextAtRoot(currentDir)
    if (currentContext) return currentContext
    if (samePath(currentDir, workspaceRoot)) break
    const parentDir = path.dirname(currentDir)
    if (!parentDir || samePath(parentDir, currentDir)) break
    currentDir = parentDir
  }

  return resolveJavaContextAtRoot(workspaceRoot)
}

export function detectNearestJavaProjectRoot(projectRoot = '', filePath = '') {
  return detectNearestJavaProjectContext(projectRoot, filePath)?.root || ''
}

