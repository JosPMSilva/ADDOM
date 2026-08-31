import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  cleanString,
  fileExists,
  normalizeLanguage,
  normalizeProjectRoot,
} from './editor-format-support.mjs'

function normalizeComparablePath(filePath = '', baseDir = '') {
  const raw = String(filePath || '').trim()
  if (!raw) return ''
  const resolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : (baseDir ? path.resolve(baseDir, raw) : path.resolve(raw))
  return process.platform === 'win32'
    ? resolved.toLowerCase()
    : resolved
}

function mirrorScratchEntry(sourcePath = '', targetPath = '') {
  if (!sourcePath || !targetPath || fileExists(targetPath)) return
  const stat = fs.lstatSync(sourcePath)
  if (stat.isDirectory()) {
    try {
      fs.symlinkSync(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      fs.cpSync(sourcePath, targetPath, { recursive: true })
    }
    return
  }

  try {
    fs.symlinkSync(sourcePath, targetPath, 'file')
  } catch {
    fs.copyFileSync(sourcePath, targetPath)
  }
}

function mirrorScratchWorkspaceScaffolding(projectRoot = '', relFilePath = '', scratchRoot = '') {
  const normalizedRoot = normalizeProjectRoot(projectRoot)
  const normalizedRelPath = String(relFilePath || '').trim().replace(/\//g, path.sep)
  if (!normalizedRoot || !normalizedRelPath || !scratchRoot) return

  const pathSegments = normalizedRelPath.split(path.sep).filter(Boolean)
  if (pathSegments.length === 0) return

  const dirSegments = pathSegments.slice(0, -1)
  const fileName = pathSegments[pathSegments.length - 1]
  let originalDir = normalizedRoot
  let scratchDir = scratchRoot

  for (const nextSegment of dirSegments) {
    fs.mkdirSync(scratchDir, { recursive: true })
    for (const entry of fs.readdirSync(originalDir, { withFileTypes: true })) {
      if (entry.name === nextSegment) continue
      mirrorScratchEntry(
        path.join(originalDir, entry.name),
        path.join(scratchDir, entry.name),
      )
    }
    originalDir = path.join(originalDir, nextSegment)
    scratchDir = path.join(scratchDir, nextSegment)
  }

  fs.mkdirSync(scratchDir, { recursive: true })
  for (const entry of fs.readdirSync(originalDir, { withFileTypes: true })) {
    if (entry.name === fileName) continue
    mirrorScratchEntry(
      path.join(originalDir, entry.name),
      path.join(scratchDir, entry.name),
    )
  }
}

function copyFileIntoScratch(projectRoot = '', sourceFilePath = '', scratchRoot = '') {
  const normalizedRoot = normalizeProjectRoot(projectRoot)
  const normalizedSource = path.resolve(String(sourceFilePath || '').trim())
  if (!normalizedRoot || !normalizedSource || !scratchRoot) return ''

  const relativeSourcePath = path.relative(normalizedRoot, normalizedSource)
  if (!relativeSourcePath || relativeSourcePath.startsWith('..') || path.isAbsolute(relativeSourcePath)) return ''
  const scratchTargetPath = path.join(scratchRoot, relativeSourcePath)
  fs.mkdirSync(path.dirname(scratchTargetPath), { recursive: true })
  fs.copyFileSync(normalizedSource, scratchTargetPath)
  return scratchTargetPath
}

function readCompileCommandsEntries(compileCommandsPath = '') {
  try {
    const parsed = JSON.parse(fs.readFileSync(compileCommandsPath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function selectCompileCommandsEntry(entries = [], absPath = '', relFilePath = '', contextRoot = '') {
  const normalizedAbsPath = normalizeComparablePath(absPath)
  const normalizedRelPath = String(relFilePath || '').trim()
  const normalizedRelPathOs = normalizedRelPath.replace(/\//g, path.sep)

  for (const entry of Array.isArray(entries) ? entries : []) {
    const entryDirectory = cleanString(entry?.directory) || contextRoot
    const entryFile = cleanString(entry?.file)
    if (!entryFile) continue
    const normalizedEntryAbsPath = normalizeComparablePath(entryFile, entryDirectory)
    if (normalizedEntryAbsPath && normalizedEntryAbsPath === normalizedAbsPath) return entry
    if (entryFile === normalizedRelPath || entryFile === normalizedRelPathOs) return entry
  }

  return null
}

function replaceCommandPathToken(command = '', fromPath = '', toPath = '') {
  const source = String(command || '')
  const rawFromPath = String(fromPath || '').trim()
  const rawToPath = String(toPath || '').trim()
  if (!source || !rawFromPath || !rawToPath) return { command: source, replaced: false }

  const variants = new Set([
    rawFromPath,
    rawFromPath.replace(/\\/g, '/'),
    rawFromPath.replace(/\//g, '\\'),
  ])
  let rewritten = source
  let replaced = false

  for (const variant of variants) {
    if (!variant) continue
    for (const [leftQuote, rightQuote] of [['"', '"'], ["'", "'"], ['', '']]) {
      const needle = `${leftQuote}${variant}${rightQuote}`
      if (!rewritten.includes(needle)) continue
      const replacement = `${leftQuote}${rawToPath}${rightQuote}`
      rewritten = rewritten.split(needle).join(replacement)
      replaced = true
    }
  }

  return { command: rewritten, replaced }
}

function buildScratchCompileCommandFromEntry(entry = null, {
  contextRoot = '',
  originalAbsPath = '',
  originalRelFilePath = '',
  originalFileDir = '',
  scratchFilePath = '',
} = {}) {
  if (!entry || !scratchFilePath) return null

  const directory = path.resolve(cleanString(entry.directory) || contextRoot)
  const originalFileCandidates = new Set([
    cleanString(entry.file),
    originalAbsPath,
    originalRelFilePath,
    path.relative(directory, originalAbsPath),
  ].filter(Boolean))

  if (Array.isArray(entry.arguments) && entry.arguments.length > 0) {
    const rewrittenArguments = []
    let replacedSourcePath = false
    for (const arg of entry.arguments) {
      const normalizedArg = String(arg)
      if (!replacedSourcePath && originalFileCandidates.has(normalizedArg)) {
        rewrittenArguments.push(scratchFilePath)
        replacedSourcePath = true
        continue
      }
      rewrittenArguments.push(normalizedArg)
    }
    if (!replacedSourcePath) rewrittenArguments.push(scratchFilePath)
    rewrittenArguments.push('-I', originalFileDir)
    return {
      directory,
      arguments: rewrittenArguments,
      file: scratchFilePath,
    }
  }

  const commandText = cleanString(entry.command)
  if (!commandText) return null

  let rewrittenCommand = commandText
  let replacedSourcePath = false
  for (const candidate of originalFileCandidates) {
    const replacement = replaceCommandPathToken(rewrittenCommand, candidate, scratchFilePath)
    if (!replacement.replaced) continue
    rewrittenCommand = replacement.command
    replacedSourcePath = true
    break
  }
  if (!replacedSourcePath) return null

  const quotedOriginalFileDir = originalFileDir.includes(' ')
    ? `"${originalFileDir}"`
    : originalFileDir
  rewrittenCommand = `${rewrittenCommand} -I ${quotedOriginalFileDir}`
  return {
    directory,
    command: rewrittenCommand,
    file: scratchFilePath,
  }
}

function readCompileFlags(compileFlagsPath = '') {
  try {
    return fs.readFileSync(compileFlagsPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function inferClangDriverFromFlags(flags = [], language = '') {
  const normalizedFlags = Array.isArray(flags)
    ? flags.map((flag) => cleanString(flag)).filter(Boolean)
    : []

  for (let index = normalizedFlags.length - 1; index >= 0; index -= 1) {
    const flag = normalizedFlags[index]
    if (flag === '-x') {
      const nextValue = cleanString(normalizedFlags[index + 1])
      if (nextValue.includes('++')) return 'clang++'
      if (nextValue === 'c' || nextValue === 'c-header') return 'clang'
      continue
    }
    if (!flag.startsWith('-x')) continue
    const xValue = cleanString(flag.slice(2))
    if (xValue.includes('++')) return 'clang++'
    if (xValue === 'c' || xValue === 'c-header') return 'clang'
  }

  const standardFlag = normalizedFlags.find((flag) => flag.startsWith('-std='))
  if (standardFlag) return standardFlag.includes('++') ? 'clang++' : 'clang'

  return normalizeLanguage(language) === 'c' ? 'clang' : 'clang++'
}

function buildScratchCompileCommandFromFlags(flags = [], {
  contextRoot = '',
  originalFileDir = '',
  scratchFilePath = '',
  language = '',
} = {}) {
  const compiler = inferClangDriverFromFlags(flags, language)
  return {
    directory: path.resolve(contextRoot || '.'),
    arguments: [
      compiler,
      ...flags.map((flag) => String(flag)),
      '-I',
      originalFileDir,
      scratchFilePath,
    ],
    file: scratchFilePath,
  }
}

export function createClangTidyScratchWorkspace({
  projectRoot = '',
  relFilePath = '',
  absPath = '',
  content = '',
  language = '',
  configRoot = '',
  compileContext = null,
} = {}) {
  const normalizedRoot = normalizeProjectRoot(projectRoot)
  const normalizedRelPath = String(relFilePath || '').trim()
  const normalizedAbsPath = path.resolve(String(absPath || '').trim())
  const normalizedContent = String(content ?? '')
  const normalizedConfigRoot = normalizeProjectRoot(configRoot)
  const context = compileContext && typeof compileContext === 'object' ? compileContext : null
  if (!normalizedRoot || !normalizedRelPath || !normalizedAbsPath || !context?.path || !context?.root) {
    throw new Error('clang-tidy scratch workspace requires a real project root, file, config, and compile context.')
  }

  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-clang-tidy-'))
  const scratchFilePath = path.join(scratchRoot, normalizedRelPath.replace(/\//g, path.sep))

  mirrorScratchWorkspaceScaffolding(normalizedRoot, normalizedRelPath, scratchRoot)
  fs.mkdirSync(path.dirname(scratchFilePath), { recursive: true })
  fs.writeFileSync(scratchFilePath, normalizedContent, 'utf8')

  const copiedConfigPath = normalizedConfigRoot
    ? copyFileIntoScratch(normalizedRoot, path.join(normalizedConfigRoot, '.clang-tidy'), scratchRoot)
    : ''

  const relativeContextRoot = path.relative(normalizedRoot, path.resolve(context.root))
  if (relativeContextRoot.startsWith('..') || path.isAbsolute(relativeContextRoot)) {
    throw new Error('clang-tidy compile context escapes the workspace root.')
  }
  const scratchContextRoot = path.join(scratchRoot, relativeContextRoot)
  fs.mkdirSync(scratchContextRoot, { recursive: true })

  let compileCommandEntry = null
  if (context.kind === 'compile_commands') {
    const entries = readCompileCommandsEntries(context.path)
    const selectedEntry = selectCompileCommandsEntry(entries, normalizedAbsPath, normalizedRelPath, context.root)
    compileCommandEntry = buildScratchCompileCommandFromEntry(selectedEntry, {
      contextRoot: context.root,
      originalAbsPath: normalizedAbsPath,
      originalRelFilePath: normalizedRelPath,
      originalFileDir: path.dirname(normalizedAbsPath),
      scratchFilePath,
    })
  } else if (context.kind === 'compile_flags') {
    const flags = readCompileFlags(context.path)
    compileCommandEntry = buildScratchCompileCommandFromFlags(flags, {
      contextRoot: context.root,
      originalFileDir: path.dirname(normalizedAbsPath),
      scratchFilePath,
      language,
    })
  }

  if (!compileCommandEntry) {
    throw new Error('Failed to derive a clang-tidy compile command for this file.')
  }

  fs.writeFileSync(
    path.join(scratchContextRoot, 'compile_commands.json'),
    `${JSON.stringify([compileCommandEntry], null, 2)}\n`,
    'utf8',
  )

  return {
    scratchRoot,
    scratchFilePath,
    scratchContextRoot,
    copiedConfigPath,
    cleanup() {
      try {
        fs.rmSync(scratchRoot, { recursive: true, force: true })
      } catch {
        // best-effort scratch workspace cleanup
      }
    },
  }
}

export function createDotnetFormatScratchWorkspace({
  projectRoot = '',
  projectPath = '',
  absPath = '',
  content = '',
} = {}) {
  const normalizedRoot = normalizeProjectRoot(projectRoot)
  const normalizedProjectPath = path.resolve(String(projectPath || '').trim())
  const normalizedAbsPath = path.resolve(String(absPath || '').trim())
  const normalizedContent = String(content ?? '')
  if (!normalizedRoot || !normalizedProjectPath || !normalizedAbsPath) {
    throw new Error('dotnet format scratch workspace requires a real project root, project path, and file path.')
  }

  const relativeProjectPath = path.relative(normalizedRoot, normalizedProjectPath)
  if (!relativeProjectPath || relativeProjectPath.startsWith('..') || path.isAbsolute(relativeProjectPath)) {
    throw new Error('dotnet format project context escapes the workspace root.')
  }

  const relativeFilePath = path.relative(normalizedRoot, normalizedAbsPath)
  if (!relativeFilePath || relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath)) {
    throw new Error('dotnet format target file escapes the workspace root.')
  }

  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-dotnet-format-'))
  const scratchFilePath = path.join(scratchRoot, relativeFilePath)
  const scratchProjectPath = path.join(scratchRoot, relativeProjectPath)

  mirrorScratchWorkspaceScaffolding(normalizedRoot, relativeFilePath, scratchRoot)
  fs.mkdirSync(path.dirname(scratchFilePath), { recursive: true })
  fs.writeFileSync(scratchFilePath, normalizedContent, 'utf8')

  return {
    scratchRoot,
    scratchFilePath,
    scratchProjectPath,
    scratchRelativeFilePath: relativeFilePath.split(path.sep).join('/'),
    cleanup() {
      try {
        fs.rmSync(scratchRoot, { recursive: true, force: true })
      } catch {
        // best-effort scratch workspace cleanup
      }
    },
  }
}

