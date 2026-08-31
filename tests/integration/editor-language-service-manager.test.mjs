import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { __testEditorLanguageServiceManagerInternals } from '../../src/main/editor/editor-language-service-manager.mjs'
import {
  __testEditorFormatInternals,
  detectNearestClangCompileContext,
  detectNearestCSharpProjectRoot,
  detectNearestJavaProjectRoot,
  detectNearestClangFormatConfigRoot,
  detectNearestClangTidyConfigRoot,
  getCodeActionRouteAvailability,
  getClangTidyFixAvailability,
  getFormattingRouteAvailability,
} from '../../src/main/ipc-handlers/editor-format.mjs'
import { detectLanguage } from '../../src/renderer/store/useEditorStore.js'

const ORIGINAL_ADDOM_USER_DATA_PATH = process.env.ADDOM_USER_DATA_PATH
process.env.ADDOM_USER_DATA_PATH ||= path.join(os.tmpdir(), 'addom-test-user-data')

const FIXTURES_ROOT = path.resolve('tests', 'fixtures')
const tempDirs = new Set()

function makeTempProject(prefix = 'addom-editor-service-') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.add(projectRoot)
  return projectRoot
}

function writeFile(projectRoot, relPath, content) {
  const absPath = path.join(projectRoot, relPath)
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, content, 'utf8')
  return absPath
}

function readFixtureFile(fileName) {
  return fs.readFileSync(path.join(FIXTURES_ROOT, fileName), 'utf8')
}

function copyFixtureDirectory(fixtureDirName, targetRoot) {
  fs.cpSync(path.join(FIXTURES_ROOT, fixtureDirName), targetRoot, { recursive: true })
}

function linkProjectLocalPackage(projectRoot, packageName) {
  const sourcePath = path.resolve('node_modules', ...String(packageName || '').split('/'))
  const targetPath = path.join(projectRoot, 'node_modules', ...String(packageName || '').split('/'))
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  try {
    fs.symlinkSync(sourcePath, targetPath, 'junction')
  } catch {
    fs.cpSync(sourcePath, targetPath, { recursive: true })
  }
  return targetPath
}

async function removeTempDir(dirPath) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true })
      return
    } catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  await fs.promises.rm(dirPath, { recursive: true, force: true })
}

function installFakeRuffCommand(projectRoot, {
  expectedInput = '',
  expectedSubcommand = 'format',
  stdout = '',
  formattedOutput = '',
  stderr = '',
  exitCode = 0,
} = {}) {
  const runnerPath = path.join(projectRoot, '.fake-ruff-bin', 'ruff-runner.cjs')
  const runnerSource = [
    `const expectedInput = ${JSON.stringify(String(expectedInput))}`,
    `const expectedSubcommand = ${JSON.stringify(String(expectedSubcommand || 'format'))}`,
    `const stdout = ${JSON.stringify(String(stdout || formattedOutput || ''))}`,
    `const stderr = ${JSON.stringify(String(stderr))}`,
    `const exitCode = ${Number(exitCode || 0)}`,
    'const args = process.argv.slice(2)',
    "let input = ''",
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (chunk) => { input += String(chunk) })",
    "process.stdin.on('end', () => {",
    "  if (!args.includes(expectedSubcommand)) {",
    "    process.stderr.write(`Expected ruff ${expectedSubcommand} invocation.`)",
    '    process.exit(90)',
    '    return',
    '  }',
    "  const stdinFilenameIndex = args.indexOf('--stdin-filename')",
    "  if (stdinFilenameIndex === -1 || !args[stdinFilenameIndex + 1]) {",
    "    process.stderr.write('Expected --stdin-filename argument.')",
    '    process.exit(91)',
    '    return',
    '  }',
    "  if (!args.includes('-')) {",
    "    process.stderr.write('Expected stdin marker.')",
    '    process.exit(92)',
    '    return',
    '  }',
    '  if (exitCode > 0) {',
    "    process.stderr.write(stderr || 'Synthetic Ruff failure.')",
    '    process.exit(exitCode)',
    '    return',
    '  }',
    '  if (input !== expectedInput) {',
    "    process.stderr.write(`Unexpected stdin: ${JSON.stringify(input)}`)",
    '    process.exit(93)',
    '    return',
    '  }',
    "  if (expectedSubcommand === 'check') {",
    "    if (!args.includes('--fix') || !args.includes('--diff')) {",
    "      process.stderr.write('Expected Ruff fix diff flags.')",
    '      process.exit(94)',
    '      return',
    '    }',
    '  }',
    '  process.stdout.write(stdout)',
    '})',
    'process.stdin.resume()',
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true })
  fs.writeFileSync(runnerPath, runnerSource, 'utf8')
  return runnerPath
}

function installFakeBiomeCommand(projectRoot, {
  expectedInput = '',
  formattedOutput = '',
  stderr = '',
  exitCode = 0,
} = {}) {
  const runnerPath = path.join(projectRoot, '.fake-biome-bin', 'biome-runner.cjs')
  const runnerSource = [
    `const expectedInput = ${JSON.stringify(String(expectedInput))}`,
    `const formattedOutput = ${JSON.stringify(String(formattedOutput))}`,
    `const stderr = ${JSON.stringify(String(stderr))}`,
    `const exitCode = ${Number(exitCode || 0)}`,
    'const args = process.argv.slice(2)',
    "let input = ''",
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (chunk) => { input += String(chunk) })",
    "process.stdin.on('end', () => {",
    "  if (!args.includes('format')) {",
    "    process.stderr.write('Expected biome format invocation.')",
    '    process.exit(90)',
    '    return',
    '  }',
    "  const stdinFilePathIndex = args.indexOf('--stdin-file-path')",
    "  if (stdinFilePathIndex === -1 || !args[stdinFilePathIndex + 1]) {",
    "    process.stderr.write('Expected --stdin-file-path argument.')",
    '    process.exit(91)',
    '    return',
    '  }',
    '  if (exitCode > 0) {',
    "    process.stderr.write(stderr || 'Synthetic Biome failure.')",
    '    process.exit(exitCode)',
    '    return',
    '  }',
    '  if (input !== expectedInput) {',
    "    process.stderr.write(`Unexpected stdin: ${JSON.stringify(input)}`)",
    '    process.exit(92)',
    '    return',
    '  }',
    '  process.stdout.write(formattedOutput)',
    '})',
    'process.stdin.resume()',
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true })
  fs.writeFileSync(runnerPath, runnerSource, 'utf8')
  return runnerPath
}

function installFakeClangFormatCommand(projectRoot, {
  expectedInput = '',
  expectedAssumeFilename = '',
  formattedOutput = '',
  stderr = '',
  exitCode = 0,
} = {}) {
  const runnerPath = path.join(projectRoot, '.fake-clang-format-bin', 'clang-format-runner.cjs')
  const runnerSource = [
    `const expectedInput = ${JSON.stringify(String(expectedInput))}`,
    `const expectedAssumeFilename = ${JSON.stringify(String(expectedAssumeFilename || ''))}`,
    `const formattedOutput = ${JSON.stringify(String(formattedOutput))}`,
    `const stderr = ${JSON.stringify(String(stderr))}`,
    `const exitCode = ${Number(exitCode || 0)}`,
    'const args = process.argv.slice(2)',
    "let input = ''",
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (chunk) => { input += String(chunk) })",
    "process.stdin.on('end', () => {",
    "  const assumeFilenameIndex = args.indexOf('--assume-filename')",
    "  if (assumeFilenameIndex === -1 || !args[assumeFilenameIndex + 1]) {",
    "    process.stderr.write('Expected --assume-filename argument.')",
    '    process.exit(90)',
    '    return',
    '  }',
    "  if (expectedAssumeFilename && args[assumeFilenameIndex + 1] !== expectedAssumeFilename) {",
    "    process.stderr.write(`Unexpected --assume-filename: ${args[assumeFilenameIndex + 1]}`)",
    '    process.exit(91)',
    '    return',
    '  }',
    "  if (!args.includes('-style=file')) {",
    "    process.stderr.write('Expected -style=file argument.')",
    '    process.exit(92)',
    '    return',
    '  }',
    "  if (!args.includes('--fallback-style=none')) {",
    "    process.stderr.write('Expected --fallback-style=none argument.')",
    '    process.exit(93)',
    '    return',
    '  }',
    '  if (exitCode > 0) {',
    "    process.stderr.write(stderr || 'Synthetic clang-format failure.')",
    '    process.exit(exitCode)',
    '    return',
    '  }',
    '  if (input !== expectedInput) {',
    "    process.stderr.write(`Unexpected stdin: ${JSON.stringify(input)}`)",
    '    process.exit(94)',
    '    return',
    '  }',
    '  process.stdout.write(formattedOutput)',
    '})',
    'process.stdin.resume()',
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true })
  fs.writeFileSync(runnerPath, runnerSource, 'utf8')
  return runnerPath
}

function installFakeClangTidyCommand(projectRoot, {
  expectedInput = '',
  expectedRelativeFilePath = '',
  expectedConfigRelativePath = '',
  expectedCompiler = '',
  fixedOutput = '',
  stderr = '',
  exitCode = 0,
} = {}) {
  const runnerPath = path.join(projectRoot, '.fake-clang-tidy-bin', 'clang-tidy-runner.cjs')
  const runnerSource = [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    `const expectedInput = ${JSON.stringify(String(expectedInput))}`,
    `const expectedRelativeFilePath = ${JSON.stringify(String(expectedRelativeFilePath || '').replace(/\//g, path.sep))}`,
    `const expectedConfigRelativePath = ${JSON.stringify(String(expectedConfigRelativePath || '').replace(/\//g, path.sep))}`,
    `const expectedCompiler = ${JSON.stringify(String(expectedCompiler || ''))}`,
    `const fixedOutput = ${JSON.stringify(String(fixedOutput))}`,
    `const stderr = ${JSON.stringify(String(stderr))}`,
    `const exitCode = ${Number(exitCode || 0)}`,
    'const args = process.argv.slice(2)',
    "const filePath = String(args[0] || '')",
    "const buildPathIndex = args.indexOf('-p')",
    "if (!filePath) {",
    "  process.stderr.write('Expected clang-tidy target file argument.')",
    '  process.exit(90)',
    '}',
    "if (!args.includes('--fix')) {",
    "  process.stderr.write('Expected --fix argument.')",
    '  process.exit(91)',
    '}',
    "if (buildPathIndex === -1 || !args[buildPathIndex + 1]) {",
    "  process.stderr.write('Expected -p build path argument.')",
    '  process.exit(92)',
    '}',
    "if (!args.includes('--quiet')) {",
    "  process.stderr.write('Expected --quiet argument.')",
    '  process.exit(93)',
    '}',
    "const buildPath = args[buildPathIndex + 1]",
    "const compileCommandsPath = path.join(buildPath, 'compile_commands.json')",
    "if (!fs.existsSync(compileCommandsPath)) {",
    "  process.stderr.write('Expected synthesized compile_commands.json in the scratch context.')",
    '  process.exit(94)',
    '}',
    "const currentInput = fs.readFileSync(filePath, 'utf8')",
    'if (currentInput !== expectedInput) {',
    "  process.stderr.write(`Unexpected scratch-file content: ${JSON.stringify(currentInput)}`)",
    '  process.exit(95)',
    '}',
    'const compileCommands = JSON.parse(fs.readFileSync(compileCommandsPath, "utf8"))',
    'if (!Array.isArray(compileCommands) || compileCommands.length !== 1) {',
    "  process.stderr.write('Expected one synthesized compile command.')",
    '  process.exit(96)',
    '}',
    "if (String(compileCommands[0].file || '') !== filePath) {",
    "  process.stderr.write('Expected synthesized compile command to target the scratch file.')",
    '  process.exit(97)',
    '}',
    'if (expectedCompiler) {',
    "  const firstArgument = Array.isArray(compileCommands[0].arguments) ? String(compileCommands[0].arguments[0] || '') : ''",
    '  if (firstArgument !== expectedCompiler) {',
    "    process.stderr.write(`Unexpected synthesized compiler: ${firstArgument}`)",
    '    process.exit(98)',
    '  }',
    '}',
    'if (expectedRelativeFilePath) {',
    "  const normalizedFilePath = filePath.split(path.sep).join('/')",
    "  const normalizedRelativeFilePath = expectedRelativeFilePath.split(path.sep).join('/')",
    '  if (!normalizedFilePath.endsWith(normalizedRelativeFilePath)) {',
    "    process.stderr.write(`Unexpected scratch file path: ${filePath}`)",
    '    process.exit(99)',
    '  }',
    '}',
    'if (expectedConfigRelativePath) {',
    "  const normalizedRelativeFilePath = expectedRelativeFilePath.split(path.sep).join(path.sep)",
    '  const scratchRoot = expectedRelativeFilePath && filePath.endsWith(normalizedRelativeFilePath)',
    '    ? filePath.slice(0, Math.max(0, filePath.length - normalizedRelativeFilePath.length))',
    '    : path.dirname(filePath)',
    '  const configPath = path.join(scratchRoot, expectedConfigRelativePath)',
    '  if (!fs.existsSync(configPath)) {',
    "    process.stderr.write(`Expected scratch config at ${configPath}`)",
    '    process.exit(100)',
    '  }',
    '}',
    'if (exitCode > 0) {',
    "  process.stderr.write(stderr || 'Synthetic clang-tidy failure.')",
    '  process.exit(exitCode)',
    '}',
    'if (fixedOutput) {',
    "  fs.writeFileSync(filePath, fixedOutput, 'utf8')",
    '}',
    'process.exit(0)',
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true })
  fs.writeFileSync(runnerPath, runnerSource, 'utf8')
  return runnerPath
}

function installFakeCSharpierCommand(projectRoot, {
  expectedInput = '',
  formattedOutput = '',
  stderr = '',
  exitCode = 0,
} = {}) {
  const runnerPath = path.join(projectRoot, '.fake-csharpier-bin', 'csharpier-runner.cjs')
  const runnerSource = [
    `const expectedInput = ${JSON.stringify(String(expectedInput))}`,
    `const formattedOutput = ${JSON.stringify(String(formattedOutput))}`,
    `const stderr = ${JSON.stringify(String(stderr))}`,
    `const exitCode = ${Number(exitCode || 0)}`,
    'const args = process.argv.slice(2)',
    "let input = ''",
    "process.stdin.setEncoding('utf8')",
    "process.stdin.on('data', (chunk) => { input += String(chunk) })",
    "process.stdin.on('end', () => {",
    "  if (args[0] !== 'csharpier' || !args.includes('format')) {",
    "    process.stderr.write('Expected dotnet csharpier format invocation.')",
    '    process.exit(90)',
    '    return',
    '  }',
    "  if (!args.includes('--write-stdout')) {",
    "    process.stderr.write('Expected --write-stdout argument.')",
    '    process.exit(91)',
    '    return',
    '  }',
    "  const logLevelIndex = args.indexOf('--log-level')",
    "  if (logLevelIndex === -1 || args[logLevelIndex + 1] !== 'Error') {",
    "    process.stderr.write('Expected --log-level Error arguments.')",
    '    process.exit(92)',
    '    return',
    '  }',
    '  if (exitCode > 0) {',
    "    process.stderr.write(stderr || 'Synthetic CSharpier failure.')",
    '    process.exit(exitCode)',
    '    return',
    '  }',
    '  if (input !== expectedInput) {',
    "    process.stderr.write(`Unexpected stdin: ${JSON.stringify(input)}`)",
    '    process.exit(93)',
    '    return',
    '  }',
    '  process.stdout.write(formattedOutput)',
    '})',
    'process.stdin.resume()',
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true })
  fs.writeFileSync(runnerPath, runnerSource, 'utf8')
  return runnerPath
}

function installFakeDotnetFormatCommand(projectRoot, {
  expectedWorkspaceRoot = '',
  expectedInput = '',
  expectedRelativeFilePath = '',
  expectedContextRelativePath = '',
  fixedOutput = '',
  stderr = '',
  exitCode = 0,
} = {}) {
  const runnerPath = path.join(projectRoot, '.fake-dotnet-format-bin', 'dotnet-format-runner.cjs')
  const runnerSource = [
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    `const expectedWorkspaceRoot = ${JSON.stringify(path.resolve(String(expectedWorkspaceRoot || '')))}`,
    `const expectedInput = ${JSON.stringify(String(expectedInput))}`,
    `const expectedRelativeFilePath = ${JSON.stringify(String(expectedRelativeFilePath || '').replace(/\//g, path.sep))}`,
    `const expectedContextRelativePath = ${JSON.stringify(String(expectedContextRelativePath || '').replace(/\//g, path.sep))}`,
    `const fixedOutput = ${JSON.stringify(String(fixedOutput))}`,
    `const stderr = ${JSON.stringify(String(stderr))}`,
    `const exitCode = ${Number(exitCode || 0)}`,
    "const statePath = path.join(path.dirname(__filename), 'dotnet-format-state.json')",
    'const args = process.argv.slice(2)',
    "const commandName = String(args[0] || '')",
    "const subcommand = String(args[1] || '')",
    "const contextPath = String(args[2] || '')",
    "if (commandName !== 'format') {",
    "  process.stderr.write('Expected dotnet format invocation.')",
    '  process.exit(90)',
    '}',
    "if (subcommand !== 'style' && subcommand !== 'analyzers') {",
    "  process.stderr.write('Expected dotnet format style/analyzers subcommand.')",
    '  process.exit(91)',
    '}',
    "if (!contextPath) {",
    "  process.stderr.write('Expected project or solution argument.')",
    '  process.exit(92)',
    '}',
    "const includeIndex = args.indexOf('--include')",
    "if (includeIndex === -1 || !args[includeIndex + 1]) {",
    "  process.stderr.write('Expected --include argument.')",
    '  process.exit(93)',
    '}',
    "const includePath = String(args[includeIndex + 1] || '')",
    "if (includePath !== expectedRelativeFilePath.split(path.sep).join('/')) {",
    "  process.stderr.write(`Unexpected include path: ${includePath}`)",
    '  process.exit(94)',
    '}',
    "const severityIndex = args.indexOf('--severity')",
    "if (severityIndex === -1 || args[severityIndex + 1] !== 'info') {",
    "  process.stderr.write('Expected --severity info arguments.')",
    '  process.exit(95)',
    '}',
    "const verbosityIndex = args.indexOf('--verbosity')",
    "if (verbosityIndex === -1 || args[verbosityIndex + 1] !== 'quiet') {",
    "  process.stderr.write('Expected --verbosity quiet arguments.')",
    '  process.exit(96)',
    '}',
    "const normalizedContextPath = path.resolve(contextPath)",
    "const normalizedContextRelativePath = expectedContextRelativePath.split(path.sep).join(path.sep)",
    'const scratchRoot = normalizedContextRelativePath && normalizedContextPath.endsWith(normalizedContextRelativePath)',
    '  ? normalizedContextPath.slice(0, Math.max(0, normalizedContextPath.length - normalizedContextRelativePath.length))',
    '  : path.dirname(normalizedContextPath)',
    "const targetFilePath = path.join(scratchRoot, expectedRelativeFilePath)",
    "const relativeToWorkspace = expectedWorkspaceRoot ? path.relative(expectedWorkspaceRoot, targetFilePath) : '..'",
    "if (expectedWorkspaceRoot && relativeToWorkspace && !relativeToWorkspace.startsWith('..') && !path.isAbsolute(relativeToWorkspace)) {",
    "  process.stderr.write(`Expected scratch file outside workspace root: ${targetFilePath}`)",
    '  process.exit(97)',
    '}',
    "if (!fs.existsSync(normalizedContextPath)) {",
    "  process.stderr.write(`Expected scratch context at ${normalizedContextPath}`)",
    '  process.exit(98)',
    '}',
    "if (!fs.existsSync(targetFilePath)) {",
    "  process.stderr.write(`Expected scratch target file at ${targetFilePath}`)",
    '  process.exit(99)',
    '}',
    "const currentInput = fs.readFileSync(targetFilePath, 'utf8')",
    "const expectedCurrentInput = subcommand === 'style' ? expectedInput : (fixedOutput || expectedInput)",
    'if (currentInput !== expectedCurrentInput) {',
    "  process.stderr.write(`Unexpected scratch-file content: ${JSON.stringify(currentInput)}`)",
    '  process.exit(100)',
    '}',
    'let state = { calls: [] }',
    'try {',
    "  state = JSON.parse(fs.readFileSync(statePath, 'utf8'))",
    '} catch {',
    '  state = { calls: [] }',
    '}',
    "if (subcommand === 'style' && state.calls.length !== 0) {",
    "  process.stderr.write('Expected style to run before analyzers.')",
    '  process.exit(101)',
    '}',
    "if (subcommand === 'analyzers' && state.calls[0] !== 'style') {",
    "  process.stderr.write('Expected analyzers to run after style.')",
    '  process.exit(102)',
    '}',
    'state.calls.push(subcommand)',
    "fs.writeFileSync(statePath, JSON.stringify(state), 'utf8')",
    'if (exitCode > 0) {',
    "  process.stderr.write(stderr || 'Synthetic dotnet format failure.')",
    '  process.exit(exitCode)',
    '}',
    "if (subcommand === 'style' && fixedOutput) {",
    "  fs.writeFileSync(targetFilePath, fixedOutput, 'utf8')",
    '}',
    'process.exit(0)',
    '',
  ].join('\n')
  fs.mkdirSync(path.dirname(runnerPath), { recursive: true })
  fs.writeFileSync(runnerPath, runnerSource, 'utf8')
  return runnerPath
}

function setFakeBiomeRunner(runnerPath = '') {
  __testEditorFormatInternals.setBiomeCommandForTests(
    runnerPath
      ? {
          command: process.execPath,
          argsPrefix: [runnerPath],
        }
      : null,
  )
}

function setFakeClangFormatRunner(runnerPath = '') {
  __testEditorFormatInternals.setClangFormatCommandForTests(
    runnerPath
      ? {
          command: process.execPath,
          argsPrefix: [runnerPath],
        }
      : null,
  )
}

function setFakeClangTidyRunner(runnerPath = '') {
  __testEditorFormatInternals.setClangTidyCommandForTests(
    runnerPath
      ? {
          command: process.execPath,
          argsPrefix: [runnerPath],
        }
      : null,
  )
}

function setFakeRuffRunner(runnerPath = '') {
  __testEditorFormatInternals.setRuffCommandForTests(
    runnerPath
      ? {
          command: process.execPath,
          argsPrefix: [runnerPath],
        }
      : null,
  )
}

function setFakeCSharpierRunner(runnerPath = '') {
  __testEditorFormatInternals.setCSharpierCommandForTests(
    runnerPath
      ? {
          command: process.execPath,
          argsPrefix: [runnerPath, 'csharpier'],
        }
      : null,
  )
}

function setFakeDotnetFormatRunner(runnerPath = '') {
  __testEditorFormatInternals.setDotnetFormatCommandForTests(
    runnerPath
      ? {
          command: process.execPath,
          argsPrefix: [runnerPath, 'format'],
        }
      : null,
  )
}

test.after(async () => {
  for (const dir of tempDirs) {
    await removeTempDir(dir)
  }
  tempDirs.clear()
  __testEditorFormatInternals.resetFormatterCommandCaches()
  if (ORIGINAL_ADDOM_USER_DATA_PATH === undefined) {
    delete process.env.ADDOM_USER_DATA_PATH
  } else {
    process.env.ADDOM_USER_DATA_PATH = ORIGINAL_ADDOM_USER_DATA_PATH
  }
})

test('renderer and main process normalize C/C++/C# file identities to the same canonical language ids', () => {
  const cases = [
    { filePath: 'src/native/example.c', expected: 'c' },
    { filePath: 'src/native/example.cc', expected: 'cpp' },
    { filePath: 'src/native/example.cpp', expected: 'cpp' },
    { filePath: 'src/native/example.cxx', expected: 'cpp' },
    { filePath: 'src/native/example.h', expected: 'cpp' },
    { filePath: 'src/native/example.hh', expected: 'cpp' },
    { filePath: 'src/native/example.hpp', expected: 'cpp' },
    { filePath: 'src/native/example.hxx', expected: 'cpp' },
    { filePath: 'src/dotnet/App.cs', expected: 'csharp' },
  ]

  for (const entry of cases) {
    assert.equal(detectLanguage(entry.filePath), entry.expected)
    assert.equal(
      __testEditorLanguageServiceManagerInternals.normalizeLanguageId('', entry.filePath),
      entry.expected,
    )
  }

  assert.equal(__testEditorLanguageServiceManagerInternals.normalizeLanguageId('C++', 'src/native/example.txt'), 'cpp')
  assert.equal(__testEditorLanguageServiceManagerInternals.normalizeLanguageId('HH', 'src/native/example.txt'), 'cpp')
  assert.equal(__testEditorLanguageServiceManagerInternals.normalizeLanguageId('c#', 'src/dotnet/App.txt'), 'csharp')
  assert.equal(__testEditorLanguageServiceManagerInternals.normalizeLanguageId('cs', 'src/dotnet/App.txt'), 'csharp')
})

test('editor format and fix routers expose placeholder route identity for C/C++/C# families', () => {
  const formattingCases = [
    {
      filePath: 'src/native/example.c',
      language: '',
      expectedSource: 'clang-format',
      expectedRouteId: 'clang-format',
      expectedFamilyId: 'c-cpp-format',
    },
    {
      filePath: 'src/native/example.hxx',
      language: 'hxx',
      expectedSource: 'clang-format',
      expectedRouteId: 'clang-format',
      expectedFamilyId: 'c-cpp-format',
    },
    {
      filePath: 'src/dotnet/App.cs',
      language: 'cs',
      expectedSource: 'csharpier',
      expectedRouteId: 'csharpier',
      expectedFamilyId: 'csharp-format',
    },
  ]

  for (const entry of formattingCases) {
    const availability = getFormattingRouteAvailability(entry.filePath, entry.language)
    assert.deepEqual({
      supported: availability?.supported,
      available: availability?.available,
      source: availability?.source,
      reason: availability?.reason,
      routeId: availability?.routeId,
      familyId: availability?.familyId,
    }, {
      supported: true,
      available: false,
      source: entry.expectedSource,
      reason: 'real_provider_missing',
      routeId: entry.expectedRouteId,
      familyId: entry.expectedFamilyId,
    })
    if (entry.expectedSource === 'csharpier') {
      assert.match(String(availability?.message || ''), /\.(csproj|sln)/i)
    } else {
      assert.match(String(availability?.message || ''), new RegExp(entry.expectedSource.replace('-', '[- ]?'), 'i'))
    }
  }

  const codeActionCases = [
    {
      filePath: 'src/native/example.hpp',
      language: '',
      expectedSource: 'clang-tidy',
      expectedRouteId: 'clang-tidy',
      expectedFamilyId: 'c-cpp-fix',
    },
    {
      filePath: 'src/dotnet/App.cs',
      language: 'c#',
      expectedSource: 'dotnet-format',
      expectedRouteId: 'dotnet-format',
      expectedFamilyId: 'csharp-fix',
    },
  ]

  for (const entry of codeActionCases) {
    const availability = getCodeActionRouteAvailability(entry.filePath, entry.language)
    assert.deepEqual({
      supported: availability?.supported,
      available: availability?.available,
      source: availability?.source,
      reason: availability?.reason,
      routeId: availability?.routeId,
      familyId: availability?.familyId,
    }, {
      supported: true,
      available: false,
      source: entry.expectedSource,
      reason: 'real_provider_missing',
      routeId: entry.expectedRouteId,
      familyId: entry.expectedFamilyId,
    })
    if (entry.expectedSource === 'dotnet-format') {
      assert.match(String(availability?.message || ''), /\.(csproj|sln)/i)
    } else {
      assert.match(String(availability?.message || ''), new RegExp(entry.expectedSource.replace('-', '[- ]?'), 'i'))
    }
  }
})

test('editor format detects the nearest clang-format config root for .clang-format and _clang-format', () => {
  const projectRoot = makeTempProject('addom-editor-service-clang-config-root-')
  writeFile(projectRoot, '_clang-format', 'BasedOnStyle: Chromium\n')
  writeFile(projectRoot, 'src/native/.clang-format', 'BasedOnStyle: Mozilla\n')
  writeFile(projectRoot, 'src/native/include/example.hpp', 'int answer();\n')
  writeFile(projectRoot, 'lib/example.c', 'int main(void) { return 0; }\n')

  assert.equal(
    detectNearestClangFormatConfigRoot(projectRoot, 'src/native/include/example.hpp'),
    path.join(projectRoot, 'src', 'native'),
  )
  assert.equal(
    detectNearestClangFormatConfigRoot(projectRoot, 'lib/example.c'),
    projectRoot,
  )
})

test('editor format route enables clang-format only when both binary and config are real', () => {
  const projectRoot = makeTempProject('addom-editor-service-clang-route-ready-')
  const filePath = 'src/native/example.cpp'
  const content = 'int main(){return 0;}\n'
  const absPath = writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, 'src/.clang-format', 'BasedOnStyle: LLVM\n')

  setFakeClangFormatRunner('')
  const missingBinary = getFormattingRouteAvailability(filePath, 'cpp', { projectFolder: projectRoot })
  assert.equal(missingBinary?.supported, true)
  assert.equal(missingBinary?.available, false)
  assert.equal(missingBinary?.source, 'clang-format')
  assert.equal(missingBinary?.reason, 'clang_format_not_installed')
  assert.equal(missingBinary?.routeId, 'clang-format')
  assert.equal(missingBinary?.familyId, 'c-cpp-format')

  const noConfigProject = makeTempProject('addom-editor-service-clang-route-missing-config-')
  writeFile(noConfigProject, filePath, content)
  const fakeClangRunner = installFakeClangFormatCommand(projectRoot, {
    expectedInput: content,
    expectedAssumeFilename: absPath,
    formattedOutput: 'int main() { return 0; }\n',
  })
  setFakeClangFormatRunner(fakeClangRunner)

  try {
    const missingConfig = getFormattingRouteAvailability(filePath, 'cpp', { projectFolder: noConfigProject })
    assert.equal(missingConfig?.supported, true)
    assert.equal(missingConfig?.available, false)
    assert.equal(missingConfig?.source, 'clang-format')
    assert.equal(missingConfig?.reason, 'real_provider_missing')
    assert.equal(missingConfig?.routeId, 'clang-format')
    assert.equal(missingConfig?.familyId, 'c-cpp-format')

    const ready = getFormattingRouteAvailability(filePath, 'cpp', { projectFolder: projectRoot })
    assert.equal(ready?.supported, true)
    assert.equal(ready?.available, true)
    assert.equal(ready?.source, 'clang-format')
    assert.equal(ready?.reason, '')
    assert.equal(ready?.routeId, 'clang-format')
    assert.equal(ready?.familyId, 'c-cpp-format')
  } finally {
    setFakeClangFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
  }
})

test('editor format detects the nearest clang-tidy config root and compile context root', () => {
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-context-root-')
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')
  writeFile(projectRoot, 'build/compile_flags.txt', [
    '-std=c++20',
    '-Iinclude',
    '',
  ].join('\n'))
  writeFile(projectRoot, 'src/native/.clang-tidy', 'Checks: modernize-use-override\n')
  writeFile(projectRoot, 'src/native/build/compile_commands.json', JSON.stringify([{
    directory: path.join(projectRoot, 'src', 'native'),
    file: 'include/example.hpp',
    arguments: ['clang++', '-std=c++20', '-Iinclude', 'include/example.hpp'],
  }], null, 2))
  writeFile(projectRoot, 'src/native/include/example.hpp', 'class Example { int value = NULL; };\n')
  writeFile(projectRoot, 'lib/example.cpp', 'int main() { return 0; }\n')

  assert.equal(
    detectNearestClangTidyConfigRoot(projectRoot, 'src/native/include/example.hpp'),
    path.join(projectRoot, 'src', 'native'),
  )
  assert.deepEqual(
    detectNearestClangCompileContext(projectRoot, 'src/native/include/example.hpp'),
    {
      root: path.join(projectRoot, 'src', 'native', 'build'),
      path: path.join(projectRoot, 'src', 'native', 'build', 'compile_commands.json'),
      kind: 'compile_commands',
    },
  )

  assert.equal(
    detectNearestClangTidyConfigRoot(projectRoot, 'lib/example.cpp'),
    projectRoot,
  )
  assert.deepEqual(
    detectNearestClangCompileContext(projectRoot, 'lib/example.cpp'),
    {
      root: path.join(projectRoot, 'build'),
      path: path.join(projectRoot, 'build', 'compile_flags.txt'),
      kind: 'compile_flags',
    },
  )
})

test('editor format route enables clang-tidy only when binary, .clang-tidy, and compile context are real', () => {
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-route-ready-')
  const filePath = 'src/native/example.cpp'
  const content = 'int *value = NULL;\n'
  writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')
  writeFile(projectRoot, 'build/compile_flags.txt', [
    '-std=c++20',
    '-Iinclude',
    '',
  ].join('\n'))

  setFakeClangTidyRunner('')
  const missingBinary = getClangTidyFixAvailability(projectRoot, filePath)
  assert.equal(missingBinary?.supported, true)
  assert.equal(missingBinary?.available, false)
  assert.equal(missingBinary?.source, 'clang-tidy')
  assert.equal(missingBinary?.reason, 'clang_tidy_not_installed')

  const missingConfigProject = makeTempProject('addom-editor-service-clang-tidy-route-missing-config-')
  writeFile(missingConfigProject, filePath, content)
  writeFile(missingConfigProject, 'build/compile_flags.txt', '-std=c++20\n')

  const missingContextProject = makeTempProject('addom-editor-service-clang-tidy-route-missing-context-')
  writeFile(missingContextProject, filePath, content)
  writeFile(missingContextProject, '.clang-tidy', 'Checks: modernize-use-nullptr\n')

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: content,
    expectedRelativeFilePath: filePath,
    expectedConfigRelativePath: '.clang-tidy',
    fixedOutput: 'int *value = nullptr;\n',
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    const missingConfig = getCodeActionRouteAvailability(filePath, 'cpp', { projectFolder: missingConfigProject })
    assert.equal(missingConfig?.supported, true)
    assert.equal(missingConfig?.available, false)
    assert.equal(missingConfig?.source, 'clang-tidy')
    assert.equal(missingConfig?.reason, 'real_provider_missing')
    assert.match(String(missingConfig?.message || ''), /\.clang-tidy/i)

    const missingContext = getCodeActionRouteAvailability(filePath, 'cpp', { projectFolder: missingContextProject })
    assert.equal(missingContext?.supported, true)
    assert.equal(missingContext?.available, false)
    assert.equal(missingContext?.source, 'clang-tidy')
    assert.equal(missingContext?.reason, 'real_provider_missing')
    assert.match(String(missingContext?.message || ''), /(compile_commands\.json|compile_flags\.txt)/i)

    const ready = getCodeActionRouteAvailability(filePath, 'cpp', { projectFolder: projectRoot })
    assert.equal(ready?.supported, true)
    assert.equal(ready?.available, true)
    assert.equal(ready?.source, 'clang-tidy')
    assert.equal(ready?.reason, '')
    assert.equal(ready?.routeId, 'clang-tidy')
    assert.equal(ready?.familyId, 'c-cpp-fix')
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
  }
})

test('editor format detects the nearest C# project root from .csproj and .sln markers', () => {
  const projectRoot = makeTempProject('addom-editor-service-csharp-project-root-')
  writeFile(projectRoot, 'workspace.sln', 'Microsoft Visual Studio Solution File, Format Version 12.00\n')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')
  writeFile(projectRoot, 'src/dotnet/App/Program.cs', 'class App {}\n')
  writeFile(projectRoot, 'src/standalone/Loose.cs', 'class Loose {}\n')

  assert.equal(
    detectNearestCSharpProjectRoot(projectRoot, 'src/dotnet/App/Program.cs'),
    path.join(projectRoot, 'src', 'dotnet', 'App'),
  )
  assert.equal(
    detectNearestCSharpProjectRoot(projectRoot, 'src/standalone/Loose.cs'),
    projectRoot,
  )
})

test('editor format route enables CSharpier only when both runtime and project context are real', () => {
  const projectRoot = makeTempProject('addom-editor-service-csharp-route-ready-')
  const filePath = 'src/dotnet/App/Program.cs'
  const content = 'class App {}\n'
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')
  writeFile(projectRoot, filePath, content)

  setFakeCSharpierRunner('')
  const missingRuntime = getFormattingRouteAvailability(filePath, 'csharp', { projectFolder: projectRoot })
  assert.equal(missingRuntime?.supported, true)
  assert.equal(missingRuntime?.available, false)
  assert.equal(missingRuntime?.source, 'csharpier')
  assert.equal(missingRuntime?.reason, 'csharpier_not_installed')
  assert.equal(missingRuntime?.routeId, 'csharpier')
  assert.equal(missingRuntime?.familyId, 'csharp-format')

  const missingProjectRoot = makeTempProject('addom-editor-service-csharp-route-missing-root-')
  writeFile(missingProjectRoot, filePath, content)
  const fakeCSharpierRunner = installFakeCSharpierCommand(projectRoot, {
    expectedInput: content,
    formattedOutput: content,
  })
  setFakeCSharpierRunner(fakeCSharpierRunner)

  try {
    const noProjectContext = getFormattingRouteAvailability(filePath, 'csharp', { projectFolder: missingProjectRoot })
    assert.equal(noProjectContext?.supported, true)
    assert.equal(noProjectContext?.available, false)
    assert.equal(noProjectContext?.source, 'csharpier')
    assert.equal(noProjectContext?.reason, 'real_provider_missing')
    assert.equal(noProjectContext?.routeId, 'csharpier')
    assert.equal(noProjectContext?.familyId, 'csharp-format')

    const ready = getFormattingRouteAvailability(filePath, 'csharp', { projectFolder: projectRoot })
    assert.equal(ready?.supported, true)
    assert.equal(ready?.available, true)
    assert.equal(ready?.source, 'csharpier')
    assert.equal(ready?.reason, '')
    assert.equal(ready?.routeId, 'csharpier')
    assert.equal(ready?.familyId, 'csharp-format')
  } finally {
    setFakeCSharpierRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
  }
})

test('editor format route enables dotnet format only when both runtime and project context are real', () => {
  const projectRoot = makeTempProject('addom-editor-service-dotnet-format-route-ready-')
  const filePath = 'src/dotnet/App/Program.cs'
  const content = 'class App {}\n'
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')
  writeFile(projectRoot, filePath, content)

  setFakeDotnetFormatRunner('')
  const missingRuntime = getCodeActionRouteAvailability(filePath, 'csharp', { projectFolder: projectRoot })
  assert.equal(missingRuntime?.supported, true)
  assert.equal(missingRuntime?.available, false)
  assert.equal(missingRuntime?.source, 'dotnet-format')
  assert.equal(missingRuntime?.reason, 'dotnet_not_installed')
  assert.equal(missingRuntime?.routeId, 'dotnet-format')
  assert.equal(missingRuntime?.familyId, 'csharp-fix')

  const missingProjectRoot = makeTempProject('addom-editor-service-dotnet-format-route-missing-root-')
  writeFile(missingProjectRoot, filePath, content)
  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: content,
    expectedRelativeFilePath: 'Program.cs',
    expectedContextRelativePath: 'App.csproj',
    fixedOutput: content,
  })
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    const noProjectContext = getCodeActionRouteAvailability(filePath, 'csharp', { projectFolder: missingProjectRoot })
    assert.equal(noProjectContext?.supported, true)
    assert.equal(noProjectContext?.available, false)
    assert.equal(noProjectContext?.source, 'dotnet-format')
    assert.equal(noProjectContext?.reason, 'real_provider_missing')
    assert.equal(noProjectContext?.routeId, 'dotnet-format')
    assert.equal(noProjectContext?.familyId, 'csharp-fix')

    const ready = getCodeActionRouteAvailability(filePath, 'csharp', { projectFolder: projectRoot })
    assert.equal(ready?.supported, true)
    assert.equal(ready?.available, true)
    assert.equal(ready?.source, 'dotnet-format')
    assert.equal(ready?.reason, '')
    assert.equal(ready?.routeId, 'dotnet-format')
    assert.equal(ready?.familyId, 'csharp-fix')
  } finally {
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
  }
})

test('editor language-service manager keeps C/C++/C# syntax-only while exposing provider-gated format and fix capability state', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-c-family-foundation-')
  const cases = [
    {
      filePath: 'src/native/example.hxx',
      content: 'int answer();\n',
      expectedLanguage: 'cpp',
      expectedFormattingSource: 'clang-format',
      expectedCodeActionSource: 'clang-tidy',
    },
    {
      filePath: 'src/dotnet/App.cs',
      content: 'class App {}\n',
      expectedLanguage: 'csharp',
      expectedFormattingSource: 'csharpier',
      expectedCodeActionSource: 'dotnet-format',
    },
  ]

  try {
    for (const entry of cases) {
      writeFile(projectRoot, entry.filePath, entry.content)

      const syncResult = manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: '',
        content: entry.content,
      })

      assert.equal(syncResult?.ok, true)
      assert.equal(syncResult?.serviceState?.document?.language, entry.expectedLanguage)

      const diagnostics = await manager.request({
        kind: 'diagnostics',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: '',
      })

      assert.equal(diagnostics?.ok, true)
      assert.equal(diagnostics?.available, false)
      assert.equal(diagnostics?.diagnosticOwnership?.mode, 'syntax-only')
      assert.equal(diagnostics?.serviceState?.document?.language, entry.expectedLanguage)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.supported, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, entry.expectedFormattingSource)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.supported, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.source, entry.expectedCodeActionSource)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'real_provider_missing')
      assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
      assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

      const formatting = await manager.request({
        kind: 'formatting',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: '',
      })

      assert.equal(formatting?.ok, true)
      assert.equal(formatting?.available, false)
      assert.equal(formatting?.source, entry.expectedFormattingSource)
      assert.equal(formatting?.reason, 'real_provider_missing')

      const codeActions = await manager.request({
        kind: 'codeActions',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: '',
      })

      assert.equal(codeActions?.ok, true)
      assert.equal(codeActions?.available, false)
      assert.equal(codeActions?.source, entry.expectedCodeActionSource)
      assert.equal(codeActions?.reason, 'real_provider_missing')
      assert.deepEqual(codeActions?.actions, [])
      assert.equal(codeActions?.serviceState?.health?.status, 'idle')
      assert.deepEqual(codeActions?.serviceState?.health?.providers, [])
    }
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C/C++ formatting disabled without a nearest clang-format config even when the binary exists', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-config-missing-')
  const filePath = 'src/native/example.cpp'
  const content = 'int main(){return 0;}\n'
  writeFile(projectRoot, filePath, content)

  const fakeClangRunner = installFakeClangFormatCommand(projectRoot, {
    expectedInput: content,
    expectedAssumeFilename: path.join(projectRoot, filePath),
    formattedOutput: 'int main() { return 0; }\n',
  })
  setFakeClangFormatRunner(fakeClangRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.document?.language, 'cpp')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'clang-format')
    assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
    assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'real_provider_missing')
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
  } finally {
    setFakeClangFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C/C++ formatting disabled when clang-format is missing from PATH', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-binary-missing-')
  writeFile(projectRoot, '.clang-format', 'BasedOnStyle: LLVM\n')
  const filePath = 'src/native/example.cpp'
  const content = 'int main(){return 0;}\n'
  writeFile(projectRoot, filePath, content)
  setFakeClangFormatRunner('')

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'clang_format_not_installed')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'clang-format')
    assert.equal(diagnostics?.serviceState?.health?.status, 'unavailable')
    assert.equal(
      diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-format' && provider.status === 'unavailable'),
      true,
    )

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'clang_format_not_installed')
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.reason, 'clang_format_not_installed')
    assert.equal(formatting?.serviceState?.health?.status, 'unavailable')
    assert.equal(
      formatting?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-format' && provider.status === 'unavailable'),
      true,
    )
  } finally {
    setFakeClangFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager formats C/C++ through clang-format and preserves changed vs no-op results', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-format-')
  writeFile(projectRoot, 'src/.clang-format', 'BasedOnStyle: LLVM\n')

  const filePath = 'src/native/example.cpp'
  const absPath = path.join(projectRoot, filePath)
  const unformatted = 'int main(){return 0;}\n'
  const formatted = 'int main() { return 0; }\n'
  writeFile(projectRoot, filePath, formatted)

  const fakeClangRunner = installFakeClangFormatCommand(projectRoot, {
    expectedInput: unformatted,
    expectedAssumeFilename: absPath,
    formattedOutput: formatted,
  })
  setFakeClangFormatRunner(fakeClangRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: unformatted,
      version: 1,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'clang-format')
    assert.equal(diagnostics?.serviceState?.health?.status, 'healthy')
    assert.equal(
      diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-format' && provider.status === 'ready'),
      true,
    )

    const firstResult = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(firstResult?.ok, true)
    assert.equal(firstResult?.available, true)
    assert.equal(firstResult?.source, 'clang-format')
    assert.equal(firstResult?.changed, true)
    assert.equal(firstResult?.formatted, formatted)
    assert.equal(firstResult?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(
      firstResult?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-format' && provider.status === 'healthy'),
      true,
    )

    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: formatted,
      version: 2,
    })

    const noOpClangRunner = installFakeClangFormatCommand(projectRoot, {
      expectedInput: formatted,
      expectedAssumeFilename: absPath,
      formattedOutput: formatted,
    })
    setFakeClangFormatRunner(noOpClangRunner)

    const secondResult = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(secondResult?.ok, true)
    assert.equal(secondResult?.available, true)
    assert.equal(secondResult?.source, 'clang-format')
    assert.equal(secondResult?.changed, false)
    assert.equal(secondResult?.formatted, formatted)
    assert.equal(secondResult?.serviceState?.capabilities?.formatting?.available, true)
  } finally {
    setFakeClangFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager formats C/C++ from unsaved in-memory content instead of stale disk content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-buffer-')
  writeFile(projectRoot, '_clang-format', 'BasedOnStyle: LLVM\n')

  const filePath = 'src/native/example.cpp'
  const absPath = path.join(projectRoot, filePath)
  const diskContent = 'int main() { return 0; }\n'
  const dirtyContent = 'int main(){return 0;}\n'
  writeFile(projectRoot, filePath, diskContent)

  const fakeClangRunner = installFakeClangFormatCommand(projectRoot, {
    expectedInput: dirtyContent,
    expectedAssumeFilename: absPath,
    formattedOutput: diskContent,
  })
  setFakeClangFormatRunner(fakeClangRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: diskContent,
      version: 1,
    })
    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: dirtyContent,
      version: 2,
    })

    const result = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.changed, true)
    assert.equal(result?.formatted, diskContent)
    assert.equal(result?.source, 'clang-format')
  } finally {
    setFakeClangFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager marks C/C++ formatting runtime failures as degraded', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-failure-')
  writeFile(projectRoot, '.clang-format', 'BasedOnStyle: LLVM\n')

  const filePath = 'src/native/example.cpp'
  const absPath = path.join(projectRoot, filePath)
  const content = 'int main(){return 0;}\n'
  writeFile(projectRoot, filePath, content)

  const fakeClangRunner = installFakeClangFormatCommand(projectRoot, {
    expectedInput: content,
    expectedAssumeFilename: absPath,
    formattedOutput: content,
    stderr: 'Synthetic clang-format failure.',
    exitCode: 2,
  })
  setFakeClangFormatRunner(fakeClangRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const result = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.reason, 'format_failed')
    assert.match(String(result?.message || ''), /Synthetic clang-format failure/)
    assert.equal(result?.serviceState?.health?.status, 'degraded')
    assert.equal(result?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(result?.serviceState?.capabilities?.formatting?.reason, 'provider_degraded')
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-format' && provider.status === 'degraded'),
      true,
    )
  } finally {
    setFakeClangFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C/C++ fix-all disabled without a nearest .clang-tidy even when compile context and clang-tidy exist', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-config-missing-')
  const filePath = 'src/native/example.cpp'
  const content = 'int *value = NULL;\n'
  writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, 'build/compile_flags.txt', '-std=c++20\n')

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: content,
    expectedRelativeFilePath: filePath,
    fixedOutput: 'int *value = nullptr;\n',
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.source, 'clang-tidy')
    assert.equal(result?.reason, 'real_provider_missing')
    assert.match(String(result?.message || ''), /\.clang-tidy/i)
    assert.deepEqual(result?.actions, [])
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(result?.serviceState?.capabilities?.codeActions?.reason, 'real_provider_missing')
    assert.equal(result?.serviceState?.health?.status, 'idle')
    assert.deepEqual(result?.serviceState?.health?.providers, [])
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C/C++ fix-all disabled without compile context even when .clang-tidy and clang-tidy exist', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-context-missing-')
  const filePath = 'src/native/example.cpp'
  const content = 'int *value = NULL;\n'
  writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: content,
    expectedRelativeFilePath: filePath,
    expectedConfigRelativePath: '.clang-tidy',
    fixedOutput: 'int *value = nullptr;\n',
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.source, 'clang-tidy')
    assert.equal(result?.reason, 'real_provider_missing')
    assert.match(String(result?.message || ''), /(compile_commands\.json|compile_flags\.txt)/i)
    assert.deepEqual(result?.actions, [])
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(result?.serviceState?.capabilities?.codeActions?.reason, 'real_provider_missing')
    assert.equal(result?.serviceState?.health?.status, 'idle')
    assert.deepEqual(result?.serviceState?.health?.providers, [])
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C/C++ formatting healthy while clang-tidy remains unavailable', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-runtime-missing-')
  const filePath = 'src/native/example.cpp'
  const content = 'int main(){return 0;}\n'
  writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, '.clang-format', 'BasedOnStyle: LLVM\n')
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')
  writeFile(projectRoot, 'build/compile_flags.txt', '-std=c++20\n')

  const fakeClangRunner = installFakeClangFormatCommand(projectRoot, {
    expectedInput: content,
    expectedAssumeFilename: path.join(projectRoot, filePath),
    formattedOutput: 'int main() { return 0; }\n',
  })
  setFakeClangFormatRunner(fakeClangRunner)
  setFakeClangTidyRunner('')

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'clang-format')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'clang_tidy_not_installed')
    assert.equal(diagnostics?.serviceState?.health?.status, 'degraded')
    assert.equal(
      diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-format' && provider.status === 'ready'),
      true,
    )
    assert.equal(
      diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-tidy' && provider.status === 'unavailable'),
      true,
    )

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, true)
    assert.equal(formatting?.source, 'clang-format')

    const codeActions = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(codeActions?.ok, true)
    assert.equal(codeActions?.available, false)
    assert.equal(codeActions?.source, 'clang-tidy')
    assert.equal(codeActions?.reason, 'clang_tidy_not_installed')
    assert.deepEqual(codeActions?.actions, [])
    assert.equal(codeActions?.serviceState?.health?.status, 'degraded')
  } finally {
    setFakeClangFormatRunner('')
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager returns one preferred clang-tidy fix-all action for changed C/C++ content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-fix-')
  const filePath = 'src/native/example.cpp'
  const content = 'int *value = NULL;\n'
  const fixedContent = 'int *value = nullptr;\n'
  writeFile(projectRoot, filePath, 'int *value = 0;\n')
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')
  writeFile(projectRoot, 'build/compile_commands.json', JSON.stringify([{
    directory: projectRoot,
    file: filePath,
    arguments: ['clang++', '-std=c++20', filePath],
  }], null, 2))

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: content,
    expectedRelativeFilePath: filePath,
    expectedConfigRelativePath: '.clang-tidy',
    fixedOutput: fixedContent,
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
      version: 1,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.source, 'clang-tidy')
    assert.deepEqual(result?.actions, [{
      id: 'clang-tidy.fixAll',
      title: 'Fix auto-fixable issues',
      kind: 'source.fixAll.clang-tidy',
      isPreferred: true,
      edit: {
        fullText: fixedContent,
      },
    }])
    assert.equal(fs.readFileSync(path.join(projectRoot, filePath), 'utf8'), 'int *value = 0;\n')
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, true)
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-tidy' && provider.status === 'healthy'),
      true,
    )
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager returns no C/C++ fix-all actions when clang-tidy makes no changes', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-fix-noop-')
  const filePath = 'src/native/example.cpp'
  const content = 'int *value = nullptr;\n'
  writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')
  writeFile(projectRoot, 'build/compile_flags.txt', [
    '-std=c++20',
    '-Iinclude',
    '',
  ].join('\n'))

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: content,
    expectedRelativeFilePath: filePath,
    expectedConfigRelativePath: '.clang-tidy',
    fixedOutput: '',
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
      version: 1,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.source, 'clang-tidy')
    assert.deepEqual(result?.actions, [])
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, true)
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager synthesizes clang for C headers backed by compile_flags', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-c-header-')
  const filePath = 'include/example.h'
  const content = 'int value = 0;\n'
  writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, '.clang-tidy', 'Checks: -*\n')
  writeFile(projectRoot, 'build/compile_flags.txt', [
    '-std=c11',
    '-Iinclude',
    '',
  ].join('\n'))

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: content,
    expectedRelativeFilePath: filePath,
    expectedConfigRelativePath: '.clang-tidy',
    expectedCompiler: 'clang',
    fixedOutput: '',
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
      version: 1,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.source, 'clang-tidy')
    assert.deepEqual(result?.actions, [])
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager builds clang-tidy fix-all actions from unsaved in-memory content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-fix-buffer-')
  const filePath = 'src/native/example.cpp'
  const diskContent = 'int *value = 0;\n'
  const dirtyContent = 'int *value = NULL;\n'
  const fixedContent = 'int *value = nullptr;\n'
  writeFile(projectRoot, filePath, diskContent)
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')
  writeFile(projectRoot, 'build/compile_commands.json', JSON.stringify([{
    directory: projectRoot,
    file: filePath,
    arguments: ['clang++', '-std=c++20', filePath],
  }], null, 2))

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: dirtyContent,
    expectedRelativeFilePath: filePath,
    expectedConfigRelativePath: '.clang-tidy',
    fixedOutput: fixedContent,
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: diskContent,
      version: 1,
    })
    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: dirtyContent,
      version: 2,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.deepEqual(result?.actions, [{
      id: 'clang-tidy.fixAll',
      title: 'Fix auto-fixable issues',
      kind: 'source.fixAll.clang-tidy',
      isPreferred: true,
      edit: {
        fullText: fixedContent,
      },
    }])
    assert.equal(fs.readFileSync(path.join(projectRoot, filePath), 'utf8'), diskContent)
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager marks C/C++ fix runtime failures as degraded', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-clang-tidy-fix-failure-')
  const filePath = 'src/native/example.cpp'
  const content = 'int *value = NULL;\n'
  writeFile(projectRoot, filePath, content)
  writeFile(projectRoot, '.clang-tidy', 'Checks: modernize-use-nullptr\n')
  writeFile(projectRoot, 'build/compile_flags.txt', '-std=c++20\n')

  const fakeClangTidyRunner = installFakeClangTidyCommand(projectRoot, {
    expectedInput: content,
    expectedRelativeFilePath: filePath,
    expectedConfigRelativePath: '.clang-tidy',
    stderr: 'Synthetic clang-tidy failure.',
    exitCode: 2,
  })
  setFakeClangTidyRunner(fakeClangTidyRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.source, 'clang-tidy')
    assert.equal(result?.reason, 'fix_failed')
    assert.match(String(result?.message || ''), /Synthetic clang-tidy failure/)
    assert.deepEqual(result?.actions, [])
    assert.equal(result?.serviceState?.health?.status, 'degraded')
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(result?.serviceState?.capabilities?.codeActions?.reason, 'provider_degraded')
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'clang-tidy' && provider.status === 'degraded'),
      true,
    )
  } finally {
    setFakeClangTidyRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C# formatting disabled without a nearest project root even when CSharpier exists', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-csharp-root-missing-')
  const filePath = 'src/dotnet/App/Program.cs'
  const content = 'class App {}\n'
  writeFile(projectRoot, filePath, content)

  const fakeCSharpierRunner = installFakeCSharpierCommand(projectRoot, {
    expectedInput: content,
    formattedOutput: content,
  })
  setFakeCSharpierRunner(fakeCSharpierRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.document?.language, 'csharp')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'csharpier')
    assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
    assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.source, 'csharpier')
    assert.equal(formatting?.reason, 'real_provider_missing')
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
  } finally {
    setFakeCSharpierRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C# formatting disabled when CSharpier is missing', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-csharp-runtime-missing-')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')
  const filePath = 'src/dotnet/App/Program.cs'
  const content = 'class App {}\n'
  writeFile(projectRoot, filePath, content)
  setFakeCSharpierRunner('')
  setFakeDotnetFormatRunner('')

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'csharpier_not_installed')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'csharpier')
    assert.equal(diagnostics?.serviceState?.health?.status, 'unavailable')
    assert.equal(
      diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'csharpier' && provider.status === 'unavailable'),
      true,
    )

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.source, 'csharpier')
    assert.equal(formatting?.reason, 'csharpier_not_installed')
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.reason, 'csharpier_not_installed')
    assert.equal(formatting?.serviceState?.health?.status, 'unavailable')
    assert.equal(
      formatting?.serviceState?.health?.providers?.some((provider) => provider.id === 'csharpier' && provider.status === 'unavailable'),
      true,
    )
  } finally {
    setFakeCSharpierRunner('')
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager formats C# through CSharpier and preserves no-op results', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-csharp-format-')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')

  const filePath = 'src/dotnet/App/Program.cs'
  const unformatted = [
    'using System;',
    'using System.Linq;',
    '',
    'public static class EditorFixtureCSharp',
    '{',
    'public static int Sum(params int[] values)=>values.Sum();',
    '',
    'public static void Main()',
    '{',
    'Console.WriteLine(Sum(2,3,5));',
    '}',
    '}',
    '',
  ].join('\n')
  const formatted = readFixtureFile('editor_fixture_csharp.cs')
  writeFile(projectRoot, filePath, formatted)

  const fakeCSharpierRunner = installFakeCSharpierCommand(projectRoot, {
    expectedInput: unformatted,
    formattedOutput: formatted,
  })
  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: unformatted,
    expectedRelativeFilePath: 'Program.cs',
    expectedContextRelativePath: 'App.csproj',
    fixedOutput: formatted,
  })
  setFakeCSharpierRunner(fakeCSharpierRunner)
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: unformatted,
      version: 1,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'csharpier')
    assert.equal(diagnostics?.serviceState?.health?.status, 'healthy')
    assert.equal(
      diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'csharpier' && provider.status === 'ready'),
      true,
    )

    const firstResult = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(firstResult?.ok, true)
    assert.equal(firstResult?.available, true)
    assert.equal(firstResult?.source, 'csharpier')
    assert.equal(firstResult?.changed, true)
    assert.equal(firstResult?.formatted, formatted)
    assert.equal(firstResult?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(
      firstResult?.serviceState?.health?.providers?.some((provider) => provider.id === 'csharpier' && provider.status === 'healthy'),
      true,
    )

    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: formatted,
      version: 2,
    })

    const noOpCSharpierRunner = installFakeCSharpierCommand(projectRoot, {
      expectedInput: formatted,
      formattedOutput: formatted,
    })
    setFakeCSharpierRunner(noOpCSharpierRunner)

    const secondResult = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(secondResult?.ok, true)
    assert.equal(secondResult?.available, true)
    assert.equal(secondResult?.source, 'csharpier')
    assert.equal(secondResult?.changed, false)
    assert.equal(secondResult?.formatted, formatted)
    assert.equal(secondResult?.serviceState?.capabilities?.formatting?.available, true)
  } finally {
    setFakeCSharpierRunner('')
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C# fix disabled without a nearest project root even when dotnet format exists', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-dotnet-fix-root-missing-')
  const filePath = 'src/dotnet/App/Program.cs'
  const content = 'class App {}\n'
  writeFile(projectRoot, filePath, content)

  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: content,
    expectedRelativeFilePath: 'Program.cs',
    expectedContextRelativePath: 'App.csproj',
    fixedOutput: content,
  })
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'real_provider_missing')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.source, 'dotnet-format')
    assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
    assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

    const codeActions = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(codeActions?.ok, true)
    assert.equal(codeActions?.available, false)
    assert.equal(codeActions?.source, 'dotnet-format')
    assert.equal(codeActions?.reason, 'real_provider_missing')
    assert.deepEqual(codeActions?.actions, [])
    assert.equal(codeActions?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(codeActions?.serviceState?.health?.status, 'idle')
    assert.deepEqual(codeActions?.serviceState?.health?.providers, [])
  } finally {
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps C# fix disabled when dotnet format is missing', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-dotnet-fix-runtime-missing-')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')
  const filePath = 'src/dotnet/App/Program.cs'
  const content = 'class App {}\n'
  writeFile(projectRoot, filePath, content)
  setFakeCSharpierRunner('')
  setFakeDotnetFormatRunner('')

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'dotnet_not_installed')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.source, 'dotnet-format')
    assert.equal(
      diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'dotnet-format' && provider.status === 'unavailable'),
      true,
    )

    const codeActions = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(codeActions?.ok, true)
    assert.equal(codeActions?.available, false)
    assert.equal(codeActions?.source, 'dotnet-format')
    assert.equal(codeActions?.reason, 'dotnet_not_installed')
    assert.deepEqual(codeActions?.actions, [])
    assert.equal(codeActions?.serviceState?.capabilities?.codeActions?.reason, 'dotnet_not_installed')
    assert.equal(
      codeActions?.serviceState?.health?.providers?.some((provider) => provider.id === 'dotnet-format' && provider.status === 'unavailable'),
      true,
    )
  } finally {
    setFakeCSharpierRunner('')
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager returns one preferred C# dotnet format fix-all action from a scratch workspace without mutating disk', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-dotnet-fix-changed-')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')

  const filePath = 'src/dotnet/App/Program.cs'
  const diskContent = [
    'using System;',
    '',
    'public static class App',
    '{',
    '    public static void Main()',
    '    {',
    '        Console.WriteLine("disk");',
    '    }',
    '}',
    '',
  ].join('\n')
  const dirtyContent = [
    'using System;',
    '',
    'public static class App',
    '{',
    'public static void Main(){Console.WriteLine("dirty");}',
    '}',
    '',
  ].join('\n')
  const fixedContent = readFixtureFile('editor_fixture_csharp.cs')
  const absPath = writeFile(projectRoot, filePath, diskContent)

  const fakeCSharpierRunner = installFakeCSharpierCommand(projectRoot, {
    expectedInput: dirtyContent,
    formattedOutput: fixedContent,
  })
  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: dirtyContent,
    expectedRelativeFilePath: 'Program.cs',
    expectedContextRelativePath: 'App.csproj',
    fixedOutput: fixedContent,
  })
  setFakeCSharpierRunner(fakeCSharpierRunner)
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: diskContent,
      version: 1,
    })
    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: dirtyContent,
      version: 2,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'csharpier')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.source, 'dotnet-format')

    const codeActions = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(codeActions?.ok, true)
    assert.equal(codeActions?.available, true)
    assert.equal(codeActions?.source, 'dotnet-format')
    assert.equal(Array.isArray(codeActions?.actions), true)
    assert.equal(codeActions.actions.length, 1)
    assert.deepEqual(codeActions.actions[0], {
      id: 'dotnet-format.fixAll',
      title: 'Fix auto-fixable issues',
      kind: 'source.fixAll.dotnet-format',
      isPreferred: true,
      edit: {
        fullText: fixedContent,
      },
    })
    assert.equal(
      codeActions?.serviceState?.health?.providers?.some((provider) => provider.id === 'dotnet-format' && provider.status === 'healthy'),
      true,
    )
    assert.equal(fs.readFileSync(absPath, 'utf8'), diskContent)
  } finally {
    setFakeCSharpierRunner('')
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager returns no C# dotnet format action when fix-all is a no-op', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-dotnet-fix-noop-')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')

  const filePath = 'src/dotnet/App/Program.cs'
  const content = readFixtureFile('editor_fixture_csharp.cs')
  writeFile(projectRoot, filePath, content)

  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: content,
    expectedRelativeFilePath: 'Program.cs',
    expectedContextRelativePath: 'App.csproj',
    fixedOutput: content,
  })
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const codeActions = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(codeActions?.ok, true)
    assert.equal(codeActions?.available, true)
    assert.equal(codeActions?.source, 'dotnet-format')
    assert.deepEqual(codeActions?.actions, [])
  } finally {
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager marks C# dotnet format runtime failures as degraded', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-dotnet-fix-failure-')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')

  const filePath = 'src/dotnet/App/Program.cs'
  const content = [
    'using System;',
    '',
    'public static class App',
    '{',
    'public static void Main(){Console.WriteLine("hello");}',
    '}',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, content)

  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: content,
    expectedRelativeFilePath: 'Program.cs',
    expectedContextRelativePath: 'App.csproj',
    fixedOutput: content,
    stderr: 'Synthetic dotnet format failure.',
    exitCode: 2,
  })
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.source, 'dotnet-format')
    assert.equal(result?.reason, 'fix_failed')
    assert.match(String(result?.message || ''), /Synthetic dotnet format failure/)
    assert.deepEqual(result?.actions, [])
    assert.equal(result?.serviceState?.health?.status, 'degraded')
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(result?.serviceState?.capabilities?.codeActions?.reason, 'provider_degraded')
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'dotnet-format' && provider.status === 'degraded'),
      true,
    )
  } finally {
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager formats C# from unsaved in-memory content instead of stale disk content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-csharp-buffer-')
  writeFile(projectRoot, 'workspace.sln', 'Microsoft Visual Studio Solution File, Format Version 12.00\n')

  const filePath = 'src/dotnet/App/Program.cs'
  const diskContent = readFixtureFile('editor_fixture_csharp.cs')
  const dirtyContent = [
    'using System;',
    'using System.Linq;',
    '',
    'public static class EditorFixtureCSharp',
    '{',
    'public static int Sum(params int[] values)=>values.Sum();',
    '',
    'public static void Main()',
    '{',
    'Console.WriteLine(Sum(2,3,5));',
    '}',
    '}',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, diskContent)

  const fakeCSharpierRunner = installFakeCSharpierCommand(projectRoot, {
    expectedInput: dirtyContent,
    formattedOutput: diskContent,
  })
  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: dirtyContent,
    expectedRelativeFilePath: filePath,
    expectedContextRelativePath: 'workspace.sln',
    fixedOutput: diskContent,
  })
  setFakeCSharpierRunner(fakeCSharpierRunner)
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: diskContent,
      version: 1,
    })
    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content: dirtyContent,
      version: 2,
    })

    const result = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.changed, true)
    assert.equal(result?.formatted, diskContent)
    assert.equal(result?.source, 'csharpier')
  } finally {
    setFakeCSharpierRunner('')
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager marks C# formatting runtime failures as degraded', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-csharp-failure-')
  writeFile(projectRoot, 'src/dotnet/App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>\n')

  const filePath = 'src/dotnet/App/Program.cs'
  const content = [
    'using System;',
    '',
    'public static class App',
    '{',
    'public static void Main(){Console.WriteLine("hello");}',
    '}',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, content)

  const fakeCSharpierRunner = installFakeCSharpierCommand(projectRoot, {
    expectedInput: content,
    formattedOutput: content,
    stderr: 'Synthetic CSharpier failure.',
    exitCode: 2,
  })
  const fakeDotnetFormatRunner = installFakeDotnetFormatCommand(projectRoot, {
    expectedWorkspaceRoot: projectRoot,
    expectedInput: content,
    expectedRelativeFilePath: 'Program.cs',
    expectedContextRelativePath: 'App.csproj',
    fixedOutput: content,
  })
  setFakeCSharpierRunner(fakeCSharpierRunner)
  setFakeDotnetFormatRunner(fakeDotnetFormatRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: '',
      content,
    })

    const result = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: '',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.source, 'csharpier')
    assert.equal(result?.reason, 'format_failed')
    assert.match(String(result?.message || ''), /Synthetic CSharpier failure/)
    assert.equal(result?.serviceState?.health?.status, 'degraded')
    assert.equal(result?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(result?.serviceState?.capabilities?.formatting?.reason, 'provider_degraded')
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'csharpier' && provider.status === 'degraded'),
      true,
    )
  } finally {
    setFakeCSharpierRunner('')
    setFakeDotnetFormatRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps JS files syntax-only when no project-configured ESLint is present', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject()
  const filePath = 'src/example.js'
  const content = 'var answer = 1\nconsole.log(answer)\n'
  writeFile(projectRoot, filePath, content)

  const syncResult = manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'javascript',
    content,
  })

  assert.equal(syncResult?.ok, true)

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'javascript',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.available, false)
  assert.equal(diagnostics?.diagnosticOwnership?.mode, 'syntax-only')
  assert.deepEqual(diagnostics?.diagnostics, [])
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
  await manager.dispose?.()
})

test('editor language-service manager lets project-configured ESLint own JS diagnostics and code actions', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject()
  writeFile(projectRoot, 'eslint.config.mjs', [
    'export default [',
    '  {',
    "    files: ['**/*.js'],",
    '    rules: {',
    "      semi: ['error', 'always'],",
    '    },',
    '  },',
    ']',
    '',
  ].join('\n'))
  const filePath = 'src/example.js'
  const content = 'const answer = 1\n'
  writeFile(projectRoot, filePath, content)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'javascript',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'javascript',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.available, true)
  assert.equal(diagnostics?.diagnosticOwnership?.mode, 'provider')
  assert.match(String(diagnostics?.diagnosticOwnership?.owner || ''), /eslint/)
  assert.equal(Array.isArray(diagnostics?.diagnostics), true)
  assert.equal(diagnostics.diagnostics.some((message) => message.ruleId === 'semi'), true)

  const codeActions = await manager.request({
    kind: 'codeActions',
    projectFolder: projectRoot,
    filePath,
    language: 'javascript',
  })

  assert.equal(codeActions?.ok, true)
  assert.equal(codeActions?.available, true)
  assert.equal(Array.isArray(codeActions?.actions), true)
  assert.equal(codeActions.actions.some((action) => action.id === 'eslint.fixAll'), true)
  await manager.dispose?.()
})

test('editor language-service manager stops provider state on workspace switch', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectA = makeTempProject('addom-editor-service-a-')
  const projectB = makeTempProject('addom-editor-service-b-')
  writeFile(projectA, 'src/a.js', 'const a = 1\n')

  manager.syncDocument({
    event: 'open',
    projectFolder: projectA,
    filePath: 'src/a.js',
    language: 'javascript',
    content: 'const a = 1\n',
  })

  const beforeSwitch = manager.__inspect()
  assert.equal(beforeSwitch.documents.length, 1)

  manager.handleActiveWorkspaceChanged(projectB)

  const afterSwitch = manager.__inspect()
  assert.equal(afterSwitch.activeWorkspaceRoot, projectB)
  assert.deepEqual(afterSwitch.documents, [])
  assert.deepEqual(afterSwitch.providerHealth, [])
  await manager.dispose?.()
})

test('editor language-service manager normalizes alternate Windows file URI forms to one document identity', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = 'C:/Users/example/Documents/ADDOM'
  const filePath = 'tests/fixtures/long_python_fixture.py'
  const canonicalUri = 'file:///C:/Users/example/Documents/ADDOM/tests/fixtures/long_python_fixture.py'
  const monacoUri = 'file:///c%3A/Users/example/Documents/ADDOM/tests/fixtures/long_python_fixture.py'
  const content = readFixtureFile('long_python_fixture.py')

  const syncResult = manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    uri: canonicalUri,
    language: 'python',
    content,
  })

  assert.equal(syncResult?.ok, true)

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    uri: monacoUri,
    language: 'python',
    content,
  })

  assert.equal(diagnostics?.ok, true)
  assert.notEqual(diagnostics?.error, 'document_not_found')

  const inspect = manager.__inspect()
  assert.equal(inspect.documents.length, 1)
  assert.equal(inspect.documents[0]?.uri, canonicalUri)
  await manager.dispose?.()
})

test('editor language-service manager resolves TypeScript definitions through tsserver in a real workspace', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-ts-')
  linkProjectLocalPackage(projectRoot, 'typescript')

  writeFile(projectRoot, 'package.json', JSON.stringify({ name: 'ts-fixture', private: true }, null, 2))
  writeFile(projectRoot, 'tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
    },
  }, null, 2))
  const helperContent = [
    'export function double(value: number) {',
    '  return value * 2',
    '}',
    '',
  ].join('\n')
  const entryContent = [
    "import { double } from './math'",
    '',
    'const output = double(2)',
    '',
  ].join('\n')
  writeFile(projectRoot, 'src/math.ts', helperContent)
  writeFile(projectRoot, 'src/index.ts', entryContent)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'src/math.ts',
    language: 'typescript',
    content: helperContent,
  })
  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'src/index.ts',
    language: 'typescript',
    content: entryContent,
  })

  const definition = await manager.request({
    kind: 'definition',
    projectFolder: projectRoot,
    filePath: 'src/index.ts',
    language: 'typescript',
    lineNumber: 3,
    column: 16,
  })

  assert.equal(definition?.ok, true)
  assert.equal(definition?.available, true)
  assert.equal(Array.isArray(definition?.locations), true)
  assert.equal(definition.locations.length > 0, true)
  assert.equal(
    definition.locations.some((location) => String(location?.filePath || '').replace(/\\/g, '/').endsWith('/src/math.ts')),
    true,
  )
  assert.equal(definition?.serviceState?.capabilities?.definition?.available, true)
  assert.equal(definition?.serviceState?.health?.providers?.some((provider) => provider.id === 'tsserver'), true)
  manager.handleActiveWorkspaceChanged('')
  await manager.dispose?.()
})

test('editor language-service manager runs Python diagnostics and semantic navigation through pyright', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-py-')
  linkProjectLocalPackage(projectRoot, 'pyright')

  const helperContent = [
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  const entryContent = [
    'from helpers import greet',
    '',
    'message = greet()',
    '',
  ].join('\n')
  writeFile(projectRoot, 'helpers.py', helperContent)
  writeFile(projectRoot, 'app.py', entryContent)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'helpers.py',
    language: 'python',
    content: helperContent,
  })
  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    content: entryContent,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.available, true)
  assert.equal(Array.isArray(diagnostics?.diagnostics), true)
  assert.equal(
    diagnostics.diagnostics.some((diagnostic) => /Argument missing for parameter/i.test(String(diagnostic?.message || ''))),
    true,
  )
  assert.equal(diagnostics?.diagnosticOwnership?.owner, 'pyright')
  assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, true)

  const hover = await manager.request({
    kind: 'hover',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    lineNumber: 3,
    column: 12,
  })

  assert.equal(hover?.ok, true)
  assert.equal(hover?.available, true)
  assert.equal(Array.isArray(hover?.contents), true)
  assert.equal(hover.contents.length > 0, true)

  const definition = await manager.request({
    kind: 'definition',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    lineNumber: 3,
    column: 12,
  })

  assert.equal(definition?.ok, true)
  assert.equal(definition?.available, true)
  assert.equal(Array.isArray(definition?.locations), true)
  assert.equal(
    definition.locations.some((location) => String(location?.filePath || '').replace(/\\/g, '/').endsWith('/helpers.py')),
    true,
  )

  const references = await manager.request({
    kind: 'references',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    lineNumber: 3,
    column: 12,
  })

  assert.equal(references?.ok, true)
  assert.equal(references?.available, true)
  assert.equal(Array.isArray(references?.locations), true)
  assert.equal(references.locations.length >= 2, true)

  const symbols = await manager.request({
    kind: 'symbols',
    projectFolder: projectRoot,
    filePath: 'helpers.py',
    language: 'python',
  })

  assert.equal(symbols?.ok, true)
  assert.equal(symbols?.available, true)
  assert.equal(Array.isArray(symbols?.outline?.items), true)
  assert.equal(symbols.outline.items.some((item) => item.name === 'greet'), true)
  assert.equal(symbols?.serviceState?.health?.providers?.some((provider) => provider.id === 'pyright'), true)
  manager.handleActiveWorkspaceChanged('')
  await manager.dispose?.()
})

test('editor language-service manager reports Python diagnostics from unsaved in-memory content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-py-buffer-')
  linkProjectLocalPackage(projectRoot, 'pyright')

  const helperContent = [
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  const diskContent = [
    'from helpers import greet',
    '',
    'message = greet("world")',
    '',
  ].join('\n')
  const dirtyContent = [
    'from helpers import greet',
    '',
    'message = greet()',
    '',
  ].join('\n')
  writeFile(projectRoot, 'helpers.py', helperContent)
  writeFile(projectRoot, 'app.py', diskContent)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'helpers.py',
    language: 'python',
    content: helperContent,
    version: 1,
  })
  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    content: diskContent,
    version: 1,
  })
  manager.syncDocument({
    event: 'change',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    content: dirtyContent,
    version: 2,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.available, true)
  assert.equal(
    diagnostics.diagnostics.some((diagnostic) => /Argument missing for parameter/i.test(String(diagnostic?.message || ''))),
    true,
  )
  await manager.dispose?.()
})

test('editor language-service manager uses the live Python buffer for diagnostics', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-py-buffer-')
  linkProjectLocalPackage(projectRoot, 'pyright')

  const helperContent = [
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  const diskEntryContent = [
    'from helpers import greet',
    '',
    'message = greet("Ada")',
    '',
  ].join('\n')
  const dirtyEntryContent = [
    'from helpers import greet',
    '',
    'message = greet()',
    '',
  ].join('\n')
  writeFile(projectRoot, 'helpers.py', helperContent)
  writeFile(projectRoot, 'app.py', diskEntryContent)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'helpers.py',
    language: 'python',
    content: helperContent,
  })
  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    content: diskEntryContent,
  })
  manager.syncDocument({
    event: 'change',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
    content: dirtyEntryContent,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath: 'app.py',
    language: 'python',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.available, true)
  assert.equal(
    diagnostics.diagnostics.some((diagnostic) => /Argument missing for parameter/i.test(String(diagnostic?.message || ''))),
    true,
  )
  manager.handleActiveWorkspaceChanged('')
})

test('editor language-service manager requires a project Biome config before formatting is available', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-biome-')
  const filePath = 'src/example.js'
  const content = 'const answer = {foo:1}\n'
  writeFile(projectRoot, filePath, content)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'javascript',
    content,
  })

  const formatting = await manager.request({
    kind: 'formatting',
    projectFolder: projectRoot,
    filePath,
    language: 'javascript',
  })

  assert.equal(formatting?.ok, true)
  assert.equal(formatting?.available, false)
  assert.equal(formatting?.reason, 'real_provider_missing')
  assert.match(String(formatting?.message || ''), /Biome config/i)
  assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, false)
})

test('editor language-service manager keeps format-only Biome files non-semantic and suppresses missing-config warning noise', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getBiomeFormatterAvailability: () => ({
      available: true,
      source: 'biome',
      reason: '',
      message: 'Using test Biome.',
    }),
  })
  const projectRoot = makeTempProject('addom-editor-service-format-only-biome-missing-')
  const filePath = 'config/settings.json'
  const content = '{\n  "name": "addom"\n}\n'
  writeFile(projectRoot, filePath, content)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'json',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'json',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.available, false)
  assert.equal(diagnostics?.diagnosticOwnership?.mode, 'syntax-only')
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'biome')
  assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
  assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
  assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

  const formatting = await manager.request({
    kind: 'formatting',
    projectFolder: projectRoot,
    filePath,
    language: 'json',
  })

  assert.equal(formatting?.ok, true)
  assert.equal(formatting?.available, false)
  assert.equal(formatting?.reason, 'real_provider_missing')
  assert.equal(formatting?.serviceState?.health?.status, 'idle')
  assert.deepEqual(formatting?.serviceState?.health?.providers, [])
  await manager.dispose?.()
})

test('editor language-service manager enables SCSS formatting through Prettier without semantic capabilities', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-format-only-biome-ready-')
  writeFile(projectRoot, 'biome.json', '{\n  "formatter": {\n    "enabled": true\n  }\n}\n')
  const filePath = 'styles/site.scss'
  const content = '.app{color:red}\n'
  writeFile(projectRoot, filePath, content)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'scss',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'scss',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'prettier')
  assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
  assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
  assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])
  await manager.dispose?.()
})

test('editor language-service manager formats the scoped Biome family on demand without semantic or fix support', async () => {
  const cases = [
    {
      filePath: 'config/settings.json',
      language: 'json',
      content: '{ "name":"addom","enabled":true }\n',
      formatted: '{\n  "name": "addom",\n  "enabled": true\n}\n',
    },
    {
      filePath: 'config/settings.jsonc',
      language: 'jsonc',
      content: '{\n  // comment\n  "name":"addom"\n}\n',
      formatted: '{\n  // comment\n  "name": "addom"\n}\n',
    },
    {
      filePath: 'styles/site.css',
      language: 'css',
      content: '.app{color:red}\n',
      formatted: '.app {\n  color: red;\n}\n',
    },
  ]

  for (const entry of cases) {
    const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
    const projectRoot = makeTempProject(`addom-editor-service-biome-format-${entry.language}-`)
    writeFile(projectRoot, 'biome.jsonc', '{\n  // test config\n  "formatter": { "enabled": true }\n}\n')
    writeFile(projectRoot, entry.filePath, entry.content)

    const fakeBiomeRunner = installFakeBiomeCommand(projectRoot, {
      expectedInput: entry.content,
      formattedOutput: entry.formatted,
    })
    setFakeBiomeRunner(fakeBiomeRunner)

    try {
      manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
        content: entry.content,
        version: 1,
      })

      const diagnostics = await manager.request({
        kind: 'diagnostics',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(diagnostics?.ok, true)
      assert.equal(diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'biome')
      assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
      assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])
      assert.deepEqual(manager.__inspect().providerSessions, [])

      const formatting = await manager.request({
        kind: 'formatting',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(formatting?.ok, true)
      assert.equal(formatting?.available, true)
      assert.equal(formatting?.source, 'biome')
      assert.equal(formatting?.changed, true)
      assert.equal(formatting?.formatted, entry.formatted)
      assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(formatting?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(formatting?.serviceState?.health?.status, 'idle')
      assert.deepEqual(formatting?.serviceState?.health?.providers, [])
      assert.deepEqual(manager.__inspect().providerSessions, [])
    } finally {
      setFakeBiomeRunner('')
      __testEditorFormatInternals.resetFormatterCommandCaches()
      await manager.dispose?.()
    }
  }
})

test('editor language-service manager formats SCSS and LESS through Prettier for the live failing inputs', async () => {
  const cases = [
    {
      filePath: 'styles/site.scss',
      language: 'scss',
      content: '.app{color:red;.child{display:block}}\n',
      formatted: '.app {\n  color: red;\n  .child {\n    display: block;\n  }\n}\n',
    },
    {
      filePath: 'styles/site.less',
      language: 'less',
      content: '.app{color:red;.child{display:block;}}\n',
      formatted: '.app {\n  color: red;\n  .child {\n    display: block;\n  }\n}\n',
    },
  ]

  for (const entry of cases) {
    const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
    const projectRoot = makeTempProject(`addom-editor-service-prettier-style-${entry.language}-`)
    writeFile(projectRoot, 'biome.jsonc', '{\n  // mirrors the live validation folder\n  "formatter": { "enabled": true }\n}\n')
    writeFile(projectRoot, entry.filePath, entry.content)

    try {
      manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
        content: entry.content,
        version: 1,
      })

      const diagnostics = await manager.request({
        kind: 'diagnostics',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(diagnostics?.ok, true)
      assert.equal(diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'prettier')
      assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
      assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

      const formatting = await manager.request({
        kind: 'formatting',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(formatting?.ok, true)
      assert.equal(formatting?.available, true)
      assert.equal(formatting?.source, 'prettier')
      assert.equal(formatting?.changed, true)
      assert.equal(formatting?.formatted, entry.formatted)
      assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(formatting?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(formatting?.serviceState?.health?.status, 'idle')
      assert.deepEqual(formatting?.serviceState?.health?.providers, [])
      assert.deepEqual(manager.__inspect().providerSessions, [])
    } finally {
      await manager.dispose?.()
    }
  }
})

test('editor language-service manager keeps scoped Biome family formatting disabled when the provider is absent', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getBiomeFormatterAvailability: () => ({
      available: false,
      source: 'biome',
      reason: 'biome_not_installed',
      message: 'Biome is unavailable in this test.',
    }),
  })
  const projectRoot = makeTempProject('addom-editor-service-biome-provider-missing-')
  writeFile(projectRoot, 'biome.json', '{\n  "formatter": {\n    "enabled": true\n  }\n}\n')
  const filePath = 'styles/site.css'
  const content = '.app{color:red}\n'
  writeFile(projectRoot, filePath, content)
  setFakeBiomeRunner('')

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'css',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: 'css',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'biome_not_installed')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'biome')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
    assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'css',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'biome_not_installed')
    assert.match(String(formatting?.message || ''), /Biome/i)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
    assert.deepEqual(manager.__inspect().providerSessions, [])
  } finally {
    setFakeBiomeRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager enables Markdown and HTML formatting as request-driven format-only support', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-markup-format-only-')
  const cases = [
    {
      filePath: 'docs/readme.md',
      language: 'markdown',
      content: '# ADDOM\n\n-   feature\n',
      formatted: '# ADDOM\n\n- feature\n',
    },
    {
      filePath: 'pages/index.html',
      language: 'html',
      content: '<html><body><section><h1>ADDOM</h1><p>ready</p></section></body></html>\n',
      formatted: '<html>\n  <body>\n    <section>\n      <h1>ADDOM</h1>\n      <p>ready</p>\n    </section>\n  </body>\n</html>\n',
    },
  ]

  try {
    for (const entry of cases) {
      writeFile(projectRoot, entry.filePath, entry.content)
      manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
        content: entry.content,
      })

      const diagnostics = await manager.request({
        kind: 'diagnostics',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(diagnostics?.ok, true)
      assert.equal(diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'prettier')
      assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
      assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

      const formatting = await manager.request({
        kind: 'formatting',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(formatting?.ok, true)
      assert.equal(formatting?.available, true)
      assert.equal(formatting?.source, 'prettier')
      assert.equal(formatting?.changed, true)
      assert.equal(formatting?.formatted, entry.formatted)
      assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(formatting?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(formatting?.serviceState?.health?.status, 'idle')
      assert.deepEqual(formatting?.serviceState?.health?.providers, [])
    }
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps Markdown format-only support quiet when the request-driven formatter is absent', async () => {
  const unavailableMarkupRoute = {
    supported: true,
    available: false,
    source: 'prettier',
    reason: 'prettier_not_installed',
    message: 'Prettier formatter is not installed.',
  }
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getFormattingRouteAvailability: (filePath = '', language = '') => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.md') || normalizedLanguage === 'markdown') {
        return unavailableMarkupRoute
      }
      return {
        supported: false,
        available: false,
        source: '',
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
        routeId: '',
        familyId: '',
      }
    },
    formatTextWithRouter: async ({ filePath = '', language = '' } = {}) => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.md') || normalizedLanguage === 'markdown') {
        return {
          ok: true,
          ...unavailableMarkupRoute,
        }
      }
      return {
        ok: true,
        available: false,
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
      }
    },
  })
  const projectRoot = makeTempProject('addom-editor-service-markup-missing-')
  const filePath = 'docs/readme.md'
  const content = '# ADDOM\n'
  writeFile(projectRoot, filePath, content)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'markdown',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: 'markdown',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'prettier_not_installed')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'prettier')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
    assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'markdown',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'prettier_not_installed')
    assert.equal(formatting?.source, 'prettier')
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager enables YAML and TOML formatting as request-driven format-only support', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-format-only-staged-')
  const cases = [
    {
      filePath: 'config/app.yaml',
      language: 'yaml',
      content: 'name: addom\nflags:\n active: true\n cached: false\nitems:\n - alpha\n - beta\n',
      formatted: 'name: addom\nflags:\n  active: true\n  cached: false\nitems:\n  - alpha\n  - beta\n',
      expectedSource: 'prettier',
    },
    {
      filePath: 'config/app.toml',
      language: 'toml',
      content: 'title="addom"\n[flags]\nactive=true\ncached=false\n',
      formatted: 'title = "addom"\n\n[flags]\nactive = true\ncached = false\n',
      expectedSource: 'smol-toml',
    },
  ]

  try {
    for (const entry of cases) {
      writeFile(projectRoot, entry.filePath, entry.content)
      manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
        content: entry.content,
      })

      const diagnostics = await manager.request({
        kind: 'diagnostics',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(diagnostics?.ok, true)
      assert.equal(diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, entry.expectedSource)
      assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
      assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

      const formatting = await manager.request({
        kind: 'formatting',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(formatting?.ok, true)
      assert.equal(formatting?.available, true)
      assert.equal(formatting?.source, entry.expectedSource)
      assert.equal(formatting?.changed, true)
      assert.equal(formatting?.formatted, entry.formatted)
      assert.equal(formatting?.serviceState?.health?.status, 'idle')
      assert.deepEqual(formatting?.serviceState?.health?.providers, [])
    }
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps TOML format-only support explicit when comments would be stripped by the formatter backend', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-toml-comments-')
  const filePath = 'config/app.toml'
  const content = 'title = "addom"\n# keep this comment\n[flags]\nactive = true\n'
  writeFile(projectRoot, filePath, content)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'toml',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: 'toml',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'toml_comments_unsupported')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'smol-toml')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
    assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'toml',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'toml_comments_unsupported')
    assert.equal(formatting?.source, 'smol-toml')
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps every format-only fixture non-semantic while exposing formatting by family', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getBiomeFormatterAvailability: () => ({
      available: true,
      source: 'biome',
      reason: '',
      message: 'Using test Biome.',
    }),
  })
  const projectRoot = makeTempProject('addom-editor-service-format-only-fixtures-')
  writeFile(projectRoot, 'biome.json', '{\n  "formatter": {\n    "enabled": true\n  }\n}\n')

  const cases = [
    { fixture: 'editor_fixture_json.json', filePath: 'fixtures/editor_fixture_json.json', language: 'json', expectedSource: 'biome' },
    { fixture: 'editor_fixture_jsonc.jsonc', filePath: 'fixtures/editor_fixture_jsonc.jsonc', language: 'jsonc', expectedSource: 'biome' },
    { fixture: 'editor_fixture_css.css', filePath: 'fixtures/editor_fixture_css.css', language: 'css', expectedSource: 'biome' },
    { fixture: 'editor_fixture_scss.scss', filePath: 'fixtures/editor_fixture_scss.scss', language: 'scss', expectedSource: 'prettier' },
    { fixture: 'editor_fixture_less.less', filePath: 'fixtures/editor_fixture_less.less', language: 'less', expectedSource: 'prettier' },
    { fixture: 'editor_fixture_markdown.md', filePath: 'fixtures/editor_fixture_markdown.md', language: 'markdown', expectedSource: 'prettier' },
    { fixture: 'editor_fixture_html.html', filePath: 'fixtures/editor_fixture_html.html', language: 'html', expectedSource: 'prettier' },
    { fixture: 'editor_fixture_yaml.yaml', filePath: 'fixtures/editor_fixture_yaml.yaml', language: 'yaml', expectedSource: 'prettier' },
    { fixture: 'editor_fixture_toml.toml', filePath: 'fixtures/editor_fixture_toml.toml', language: 'toml', expectedSource: 'smol-toml' },
  ]

  try {
    for (const entry of cases) {
      const content = readFixtureFile(entry.fixture)
      writeFile(projectRoot, entry.filePath, content)

      manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
        content,
      })

      const diagnostics = await manager.request({
        kind: 'diagnostics',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(diagnostics?.ok, true)
      assert.equal(diagnostics?.available, false)
      assert.equal(diagnostics?.diagnosticOwnership?.mode, 'syntax-only')
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, entry.expectedSource)
      assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.diagnostics?.reason, 'format_only_language')
      assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.hover?.reason, 'format_only_language')
      assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.definition?.reason, 'format_only_language')
      assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.references?.reason, 'format_only_language')
      assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.reason, 'format_only_language')
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'format_only_language')
      assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
      assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])
      assert.deepEqual(manager.__inspect().providerSessions, [])
    }
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager preserves no-op formatting results for format-only families', async () => {
  const cases = [
    {
      name: 'biome',
      filePath: 'fixtures/editor_fixture_json.json',
      language: 'json',
      content: readFixtureFile('editor_fixture_json.json'),
      expectedSource: 'biome',
      createManager: () => __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
        getBiomeFormatterAvailability: () => ({
          available: true,
          source: 'biome',
          reason: '',
          message: 'Using test Biome.',
        }),
      }),
      beforeRequest(projectRoot, content) {
        writeFile(projectRoot, 'biome.json', '{\n  "formatter": {\n    "enabled": true\n  }\n}\n')
        const fakeBiomeRunner = installFakeBiomeCommand(projectRoot, {
          expectedInput: content,
          formattedOutput: content,
        })
        setFakeBiomeRunner(fakeBiomeRunner)
      },
      afterRequest() {
        setFakeBiomeRunner('')
        __testEditorFormatInternals.resetFormatterCommandCaches()
      },
    },
    {
      name: 'markup',
      filePath: 'fixtures/editor_fixture_markdown.md',
      language: 'markdown',
      content: readFixtureFile('editor_fixture_markdown.md'),
      expectedSource: 'prettier',
      createManager: () => __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
        getFormattingRouteAvailability: (filePath = '', language = '') => {
          const normalizedPath = String(filePath || '').trim().toLowerCase()
          const normalizedLanguage = String(language || '').trim().toLowerCase()
          if (normalizedPath.endsWith('.md') || normalizedLanguage === 'markdown') {
            return {
              supported: true,
              available: true,
              source: 'prettier',
              reason: '',
              message: 'Using test Prettier.',
              routeId: 'markup',
              familyId: 'markup-prose',
            }
          }
          return {
            supported: false,
            available: false,
            source: '',
            reason: 'unsupported_file',
            message: 'No formatter is configured for this file type.',
            routeId: '',
            familyId: '',
          }
        },
        formatTextWithRouter: async ({ filePath = '', language = '', content = '' } = {}) => {
          const normalizedPath = String(filePath || '').trim().toLowerCase()
          const normalizedLanguage = String(language || '').trim().toLowerCase()
          if (normalizedPath.endsWith('.md') || normalizedLanguage === 'markdown') {
            return {
              ok: true,
              available: true,
              source: 'prettier',
              changed: false,
              formatted: String(content || ''),
            }
          }
          return {
            ok: true,
            available: false,
            reason: 'unsupported_file',
            message: 'No formatter is configured for this file type.',
          }
        },
      }),
    },
    {
      name: 'data-config-yaml',
      filePath: 'fixtures/editor_fixture_yaml.yaml',
      language: 'yaml',
      content: readFixtureFile('editor_fixture_yaml.yaml'),
      expectedSource: 'prettier',
      createManager: () => __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager(),
    },
    {
      name: 'data-config-toml',
      filePath: 'fixtures/editor_fixture_toml.toml',
      language: 'toml',
      content: readFixtureFile('editor_fixture_toml.toml'),
      expectedSource: 'smol-toml',
      createManager: () => __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager(),
    },
  ]

  for (const entry of cases) {
    const manager = entry.createManager()
    const projectRoot = makeTempProject(`addom-editor-service-format-only-noop-${entry.name}-`)
    writeFile(projectRoot, entry.filePath, entry.content)

    try {
      entry.beforeRequest?.(projectRoot, entry.content)
      manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
        content: entry.content,
      })

      const formatting = await manager.request({
        kind: 'formatting',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(formatting?.ok, true)
      assert.equal(formatting?.available, true)
      assert.equal(formatting?.source, entry.expectedSource)
      assert.equal(formatting?.changed, false)
      assert.equal(formatting?.formatted, entry.content)
      assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, true)
      assert.equal(formatting?.serviceState?.capabilities?.codeActions?.available, false)
      assert.equal(formatting?.serviceState?.health?.status, 'idle')
      assert.deepEqual(formatting?.serviceState?.health?.providers, [])
      assert.deepEqual(manager.__inspect().providerSessions, [])
    } finally {
      entry.afterRequest?.()
      await manager.dispose?.()
    }
  }
})

test('editor language-service manager keeps YAML format-only support quiet when the request-driven formatter is absent', async () => {
  const unavailableYamlRoute = {
    supported: true,
    available: false,
    source: 'prettier',
    reason: 'prettier_not_installed',
    message: 'Prettier formatter is not installed.',
  }
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getFormattingRouteAvailability: (filePath = '', language = '') => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml') || normalizedLanguage === 'yaml') {
        return unavailableYamlRoute
      }
      return {
        supported: false,
        available: false,
        source: '',
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
        routeId: '',
        familyId: '',
      }
    },
    formatTextWithRouter: async ({ filePath = '', language = '' } = {}) => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml') || normalizedLanguage === 'yaml') {
        return {
          ok: true,
          ...unavailableYamlRoute,
        }
      }
      return {
        ok: true,
        available: false,
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
      }
    },
  })
  const projectRoot = makeTempProject('addom-editor-service-yaml-missing-')
  const filePath = 'config/app.yaml'
  const content = readFixtureFile('editor_fixture_yaml.yaml')
  writeFile(projectRoot, filePath, content)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'yaml',
      content,
    })

    const diagnostics = await manager.request({
      kind: 'diagnostics',
      projectFolder: projectRoot,
      filePath,
      language: 'yaml',
    })

    assert.equal(diagnostics?.ok, true)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'prettier_not_installed')
    assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'prettier')
    assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(diagnostics?.serviceState?.health?.status, 'idle')
    assert.deepEqual(diagnostics?.serviceState?.health?.providers, [])

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'yaml',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'prettier_not_installed')
    assert.equal(formatting?.source, 'prettier')
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
    assert.deepEqual(manager.__inspect().providerSessions, [])
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps Biome format-only runtime failures out of degraded service health', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getBiomeFormatterAvailability: () => ({
      available: true,
      source: 'biome',
      reason: '',
      message: 'Using test Biome.',
    }),
  })
  const projectRoot = makeTempProject('addom-editor-service-format-only-biome-failure-')
  writeFile(projectRoot, 'biome.json', '{\n  "formatter": {\n    "enabled": true\n  }\n}\n')
  const filePath = 'fixtures/editor_fixture_json.json'
  const content = readFixtureFile('editor_fixture_json.json')
  writeFile(projectRoot, filePath, content)

  const fakeBiomeRunner = installFakeBiomeCommand(projectRoot, {
    expectedInput: content,
    formattedOutput: content,
    stderr: 'Synthetic Biome failure.',
    exitCode: 2,
  })
  setFakeBiomeRunner(fakeBiomeRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'json',
      content,
    })

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'json',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'format_failed')
    assert.match(String(formatting?.message || ''), /Synthetic Biome failure/)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
    assert.deepEqual(manager.__inspect().providerSessions, [])
  } finally {
    setFakeBiomeRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps markup format-only runtime failures out of degraded service health', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getFormattingRouteAvailability: (filePath = '', language = '') => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.md') || normalizedLanguage === 'markdown') {
        return {
          supported: true,
          available: true,
          source: 'prettier',
          reason: '',
          message: 'Using test Prettier.',
          routeId: 'markup',
          familyId: 'markup-prose',
        }
      }
      return {
        supported: false,
        available: false,
        source: '',
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
        routeId: '',
        familyId: '',
      }
    },
    formatTextWithRouter: async ({ filePath = '', language = '', content = '' } = {}) => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.md') || normalizedLanguage === 'markdown') {
        return {
          ok: true,
          available: false,
          source: 'prettier',
          reason: 'format_failed',
          message: 'Synthetic Prettier failure.',
          changed: false,
          formatted: String(content || ''),
        }
      }
      return {
        ok: true,
        available: false,
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
      }
    },
  })
  const projectRoot = makeTempProject('addom-editor-service-format-only-markup-failure-')
  const filePath = 'fixtures/editor_fixture_markdown.md'
  const content = readFixtureFile('editor_fixture_markdown.md')
  writeFile(projectRoot, filePath, content)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'markdown',
      content,
    })

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'markdown',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'format_failed')
    assert.equal(formatting?.source, 'prettier')
    assert.match(String(formatting?.message || ''), /Synthetic Prettier failure/)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(formatting?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
    assert.deepEqual(manager.__inspect().providerSessions, [])
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps data-config format-only runtime failures out of degraded service health', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getFormattingRouteAvailability: (filePath = '', language = '') => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml') || normalizedLanguage === 'yaml') {
        return {
          supported: true,
          available: true,
          source: 'prettier',
          reason: '',
          message: 'Using test Prettier.',
          routeId: 'yaml',
          familyId: 'data-config',
        }
      }
      return {
        supported: false,
        available: false,
        source: '',
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
        routeId: '',
        familyId: '',
      }
    },
    formatTextWithRouter: async ({ filePath = '', language = '', content = '' } = {}) => {
      const normalizedPath = String(filePath || '').trim().toLowerCase()
      const normalizedLanguage = String(language || '').trim().toLowerCase()
      if (normalizedPath.endsWith('.yaml') || normalizedPath.endsWith('.yml') || normalizedLanguage === 'yaml') {
        return {
          ok: true,
          available: false,
          source: 'prettier',
          reason: 'format_failed',
          message: 'Synthetic YAML formatting failure.',
          changed: false,
          formatted: String(content || ''),
        }
      }
      return {
        ok: true,
        available: false,
        reason: 'unsupported_file',
        message: 'No formatter is configured for this file type.',
      }
    },
  })
  const projectRoot = makeTempProject('addom-editor-service-format-only-data-config-failure-')
  const filePath = 'fixtures/editor_fixture_yaml.yaml'
  const content = readFixtureFile('editor_fixture_yaml.yaml')
  writeFile(projectRoot, filePath, content)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'yaml',
      content,
    })

    const formatting = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'yaml',
    })

    assert.equal(formatting?.ok, true)
    assert.equal(formatting?.available, false)
    assert.equal(formatting?.reason, 'format_failed')
    assert.equal(formatting?.source, 'prettier')
    assert.match(String(formatting?.message || ''), /Synthetic YAML formatting failure/)
    assert.equal(formatting?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(formatting?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(formatting?.serviceState?.health?.status, 'idle')
    assert.deepEqual(formatting?.serviceState?.health?.providers, [])
    assert.deepEqual(manager.__inspect().providerSessions, [])
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps INI and ENV files explicit unsupported for formatting', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-config-unsupported-')
  const cases = [
    {
      filePath: 'config/app.ini',
      language: 'ini',
      content: '[fixture]\nname = addom\n',
    },
    {
      filePath: 'config/app.env',
      language: 'dotenv',
      content: 'APP_NAME=ADDOM\nEDITOR_FIXTURE=true\n',
    },
  ]

  try {
    for (const entry of cases) {
      writeFile(projectRoot, entry.filePath, entry.content)
      manager.syncDocument({
        event: 'open',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
        content: entry.content,
      })

      const diagnostics = await manager.request({
        kind: 'diagnostics',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(diagnostics?.ok, true)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
      assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'unsupported')
      assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)

      const formatting = await manager.request({
        kind: 'formatting',
        projectFolder: projectRoot,
        filePath: entry.filePath,
        language: entry.language,
      })

      assert.equal(formatting?.ok, true)
      assert.equal(formatting?.available, false)
      assert.equal(formatting?.reason, 'unsupported_file')
      assert.match(String(formatting?.message || ''), /No formatter is configured/i)
    }
  } finally {
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps Python formatting disabled without real Ruff config and avoids warning-noise health state', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getRuffFormatterAvailability: () => ({
      available: true,
      source: 'ruff',
      reason: '',
      message: 'Using test Ruff.',
    }),
  })
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-missing-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[project]',
    'name = "python-ruff-missing"',
    'version = "0.1.0"',
    '',
  ].join('\n'))
  const filePath = 'src/example.py'
  const content = 'def greet(name: str) -> str:\n    return f"Hello, {name}"\n'
  writeFile(projectRoot, filePath, content)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'python',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'python',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'ruff')
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'real_provider_missing')
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.source, 'ruff')
  assert.equal(diagnostics?.serviceState?.health?.status, 'healthy')
  assert.equal(
    diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'ruff'),
    false,
  )
  await manager.dispose?.()
})

test('editor language-service manager enables Python formatting capability when Ruff config and provider are real', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getRuffFormatterAvailability: () => ({
      available: true,
      source: 'ruff',
      reason: '',
      message: 'Using test Ruff.',
    }),
  })
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-ready-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.format]',
    'quote-style = "double"',
    '',
  ].join('\n'))
  const filePath = 'src/example.py'
  const content = 'def greet(name: str) -> str:\n    return f"Hello, {name}"\n'
  writeFile(projectRoot, filePath, content)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'python',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'python',
  })

  assert.equal(diagnostics?.ok, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.source, 'ruff')
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.source, 'ruff')
  assert.equal(
    diagnostics?.serviceState?.health?.providers?.some((provider) => provider.id === 'ruff' && provider.status === 'ready'),
    true,
  )
  await manager.dispose?.()
})

test('editor language-service manager formats Python through Ruff and preserves changed vs no-op results', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-format-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.format]',
    'quote-style = "double"',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const unformatted = [
    'def greet( name:str)->str:',
    "  return 'hi,'+name",
    '',
  ].join('\n')
  const formatted = [
    'def greet(name: str) -> str:',
    '    return "hi," + name',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, formatted)

  const fakeRuffRunner = installFakeRuffCommand(projectRoot, {
    expectedInput: unformatted,
    formattedOutput: formatted,
  })
  setFakeRuffRunner(fakeRuffRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content: unformatted,
      version: 1,
    })

    const firstResult = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(firstResult?.ok, true)
    assert.equal(firstResult?.available, true)
    assert.equal(firstResult?.source, 'ruff')
    assert.equal(firstResult?.changed, true)
    assert.equal(firstResult?.formatted, formatted)
    assert.equal(firstResult?.serviceState?.capabilities?.formatting?.available, true)
    assert.equal(
      firstResult?.serviceState?.health?.providers?.some((provider) => provider.id === 'ruff' && provider.status === 'healthy'),
      true,
    )

    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content: formatted,
      version: 2,
    })

    const noOpRuffRunner = installFakeRuffCommand(projectRoot, {
      expectedInput: formatted,
      formattedOutput: formatted,
    })
    setFakeRuffRunner(noOpRuffRunner)

    const secondResult = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(secondResult?.ok, true)
    assert.equal(secondResult?.available, true)
    assert.equal(secondResult?.source, 'ruff')
    assert.equal(secondResult?.changed, false)
    assert.equal(secondResult?.formatted, formatted)
    assert.equal(secondResult?.serviceState?.capabilities?.formatting?.available, true)
  } finally {
    setFakeRuffRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager formats Python from unsaved in-memory content instead of stale disk content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-format-buffer-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.format]',
    'quote-style = "double"',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const diskContent = [
    'def greet(name: str) -> str:',
    '    return "hi," + name',
    '',
  ].join('\n')
  const dirtyContent = [
    'def greet( name:str)->str:',
    "  return 'hi,'+name",
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, diskContent)

  const fakeRuffRunner = installFakeRuffCommand(projectRoot, {
    expectedInput: dirtyContent,
    formattedOutput: diskContent,
  })
  setFakeRuffRunner(fakeRuffRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content: diskContent,
      version: 1,
    })
    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content: dirtyContent,
      version: 2,
    })

    const result = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.changed, true)
    assert.equal(result?.formatted, diskContent)
    assert.equal(result?.source, 'ruff')
  } finally {
    setFakeRuffRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager keeps Python fix-all unavailable without real Ruff config', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    getRuffFixAvailability: () => ({
      available: true,
      source: 'ruff',
      reason: '',
      message: 'Using test Ruff.',
    }),
  })
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-fix-missing-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[project]',
    'name = "python-ruff-fix-missing"',
    'version = "0.1.0"',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const content = [
    'import os',
    '',
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, content)

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'python',
    content,
  })

  const result = await manager.request({
    kind: 'codeActions',
    projectFolder: projectRoot,
    filePath,
    language: 'python',
  })

  assert.equal(result?.ok, true)
  assert.equal(result?.available, false)
  assert.equal(result?.reason, 'real_provider_missing')
  assert.equal(Array.isArray(result?.actions), true)
  assert.equal(result.actions.length, 0)
  assert.equal(result?.serviceState?.capabilities?.codeActions?.available, false)
  assert.equal(result?.serviceState?.capabilities?.codeActions?.reason, 'real_provider_missing')
  assert.equal(result?.serviceState?.health?.status, 'healthy')
  assert.equal(
    result?.serviceState?.health?.providers?.some((provider) => provider.id === 'ruff'),
    false,
  )
  await manager.dispose?.()
})

test('editor language-service manager returns one preferred Ruff fix-all action for changed Python content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-fix-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.lint]',
    'select = ["F"]',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const content = [
    'import os',
    '',
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  const fixedContent = [
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, fixedContent)

  const fakeRuffRunner = installFakeRuffCommand(projectRoot, {
    expectedInput: content,
    expectedSubcommand: 'check',
    stdout: [
      '--- src/example.py',
      '+++ src/example.py',
      '@@ -1,4 +1,2 @@',
      '-import os',
      '-',
      ' def greet(name: str) -> str:',
      '     return f"Hello, {name}"',
      '',
    ].join('\n'),
  })
  setFakeRuffRunner(fakeRuffRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content,
      version: 1,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.source, 'ruff')
    assert.equal(Array.isArray(result?.actions), true)
    assert.equal(result.actions.length, 1)
    assert.deepEqual(result.actions[0], {
      id: 'ruff.fixAll',
      title: 'Fix auto-fixable issues',
      kind: 'source.fixAll.ruff',
      isPreferred: true,
      edit: {
        fullText: fixedContent,
      },
    })
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, true)
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'ruff' && provider.status === 'healthy'),
      true,
    )
  } finally {
    setFakeRuffRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager returns no Python fix-all actions when Ruff makes no changes', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-fix-noop-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.lint]',
    'select = ["F"]',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const content = [
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, content)

  const fakeRuffRunner = installFakeRuffCommand(projectRoot, {
    expectedInput: content,
    expectedSubcommand: 'check',
    stdout: '',
  })
  setFakeRuffRunner(fakeRuffRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content,
      version: 1,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.source, 'ruff')
    assert.deepEqual(result?.actions, [])
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, true)
  } finally {
    setFakeRuffRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager builds Python fix-all actions from unsaved in-memory content instead of stale disk content', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-fix-buffer-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.lint]',
    'select = ["F"]',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const diskContent = [
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  const dirtyContent = [
    'import os',
    '',
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, diskContent)

  const fakeRuffRunner = installFakeRuffCommand(projectRoot, {
    expectedInput: dirtyContent,
    expectedSubcommand: 'check',
    stdout: [
      '--- src/example.py',
      '+++ src/example.py',
      '@@ -1,4 +1,2 @@',
      '-import os',
      '-',
      ' def greet(name: str) -> str:',
      '     return f"Hello, {name}"',
      '',
    ].join('\n'),
  })
  setFakeRuffRunner(fakeRuffRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content: diskContent,
      version: 1,
    })
    manager.syncDocument({
      event: 'change',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content: dirtyContent,
      version: 2,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, true)
    assert.equal(result?.source, 'ruff')
    assert.deepEqual(result?.actions, [{
      id: 'ruff.fixAll',
      title: 'Fix auto-fixable issues',
      kind: 'source.fixAll.ruff',
      isPreferred: true,
      edit: {
        fullText: diskContent,
      },
    }])
  } finally {
    setFakeRuffRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager marks Python formatting runtime failures as degraded', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-failure-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.format]',
    'quote-style = "double"',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const content = [
    'def greet( name:str)->str:',
    "  return 'hi,'+name",
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, content)

  const fakeRuffRunner = installFakeRuffCommand(projectRoot, {
    expectedInput: content,
    formattedOutput: content,
    stderr: 'Synthetic Ruff failure.',
    exitCode: 2,
  })
  setFakeRuffRunner(fakeRuffRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content,
    })

    const result = await manager.request({
      kind: 'formatting',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.reason, 'format_failed')
    assert.match(String(result?.message || ''), /Synthetic Ruff failure/)
    assert.equal(result?.serviceState?.health?.status, 'degraded')
    assert.equal(result?.serviceState?.capabilities?.formatting?.available, false)
    assert.equal(result?.serviceState?.capabilities?.formatting?.reason, 'provider_degraded')
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'ruff' && provider.status === 'degraded'),
      true,
    )
  } finally {
    setFakeRuffRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager marks Python fix runtime failures as degraded', async () => {
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager()
  const projectRoot = makeTempProject('addom-editor-service-python-ruff-fix-failure-')
  linkProjectLocalPackage(projectRoot, 'pyright')
  writeFile(projectRoot, 'pyproject.toml', [
    '[tool.ruff.lint]',
    'select = ["F"]',
    '',
  ].join('\n'))

  const filePath = 'src/example.py'
  const content = [
    'import os',
    '',
    'def greet(name: str) -> str:',
    '    return f"Hello, {name}"',
    '',
  ].join('\n')
  writeFile(projectRoot, filePath, content)

  const fakeRuffRunner = installFakeRuffCommand(projectRoot, {
    expectedInput: content,
    expectedSubcommand: 'check',
    stderr: 'Synthetic Ruff fix failure.',
    exitCode: 2,
  })
  setFakeRuffRunner(fakeRuffRunner)

  try {
    manager.syncDocument({
      event: 'open',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
      content,
    })

    const result = await manager.request({
      kind: 'codeActions',
      projectFolder: projectRoot,
      filePath,
      language: 'python',
    })

    assert.equal(result?.ok, true)
    assert.equal(result?.available, false)
    assert.equal(result?.reason, 'fix_failed')
    assert.match(String(result?.message || ''), /Synthetic Ruff fix failure/)
    assert.deepEqual(result?.actions, [])
    assert.equal(result?.serviceState?.health?.status, 'degraded')
    assert.equal(result?.serviceState?.capabilities?.codeActions?.available, false)
    assert.equal(result?.serviceState?.capabilities?.codeActions?.reason, 'provider_degraded')
    assert.equal(
      result?.serviceState?.health?.providers?.some((provider) => provider.id === 'ruff' && provider.status === 'degraded'),
      true,
    )
  } finally {
    setFakeRuffRunner('')
    __testEditorFormatInternals.resetFormatterCommandCaches()
    await manager.dispose?.()
  }
})

test('editor language-service manager starts semantic providers lazily and reuses one cached session', async () => {
  const projectRoot = makeTempProject('addom-editor-service-lazy-')
  const createdSessions = []
  const fakeSession = {
    async start() {
      return true
    },
    async stop() {
      return true
    },
    async requestDefinition() {
      return [{
        uri: 'file:///tmp/example.ts',
        filePath: path.join(projectRoot, 'src/example.ts'),
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 4,
        },
      }]
    },
    async updateDocument() {},
    async closeDocument() {},
  }

  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveTsServerRuntime: () => ({
      id: 'tsserver',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-tsserver.js'),
      message: 'Using fake tsserver.',
      reason: '',
    }),
    createTsServerProviderSession: () => {
      createdSessions.push(true)
      return fakeSession
    },
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'src/example.ts',
    language: 'typescript',
    content: 'export const value = 1\n',
  })

  assert.equal(manager.__inspect().providerSessions.length, 0)

  const firstDefinition = await manager.request({
    kind: 'definition',
    projectFolder: projectRoot,
    filePath: 'src/example.ts',
    language: 'typescript',
    lineNumber: 1,
    column: 14,
  })
  const secondDefinition = await manager.request({
    kind: 'definition',
    projectFolder: projectRoot,
    filePath: 'src/example.ts',
    language: 'typescript',
    lineNumber: 1,
    column: 14,
  })

  assert.equal(firstDefinition?.available, true)
  assert.equal(secondDefinition?.available, true)
  assert.equal(createdSessions.length, 1)
  assert.equal(manager.__inspect().providerSessions.length, 1)
  await manager.dispose?.()
})

test('editor language-service manager degrades semantic requests when the provider fails after startup', async () => {
  const projectRoot = makeTempProject('addom-editor-service-degraded-')
  const stopCalls = []
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveTsServerRuntime: () => ({
      id: 'tsserver',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-tsserver.js'),
      message: 'Using fake tsserver.',
      reason: '',
    }),
    createTsServerProviderSession: (_resolution, { onFailure } = {}) => ({
      async start() {
        return true
      },
      async stop() {
        stopCalls.push('stop')
        return true
      },
      async requestDefinition() {
        onFailure?.('Definition request failed.')
        throw new Error('Definition request failed.')
      },
      async updateDocument() {},
      async closeDocument() {},
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'src/example.ts',
    language: 'typescript',
    content: 'export const value = 1\n',
  })

  const definition = await manager.request({
    kind: 'definition',
    projectFolder: projectRoot,
    filePath: 'src/example.ts',
    language: 'typescript',
    lineNumber: 1,
    column: 14,
  })

  assert.equal(definition?.ok, true)
  assert.equal(definition?.available, false)
  assert.equal(definition?.reason, 'provider_request_failed')
  assert.equal(definition?.serviceState?.health?.status, 'degraded')
  assert.equal(definition?.serviceState?.capabilities?.definition?.available, false)

  manager.handleActiveWorkspaceChanged(makeTempProject('addom-editor-service-degraded-next-'))
  assert.equal(stopCalls.length, 1)
  assert.equal(manager.__inspect().providerSessions.length, 0)
  await manager.dispose?.()
})

test('editor language-service manager treats tsserver no-content hover misses as empty hover results', async () => {
  const projectRoot = makeTempProject('addom-editor-service-hover-miss-')
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveTsServerRuntime: () => ({
      id: 'tsserver',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-tsserver.js'),
      message: 'Using fake tsserver.',
      reason: '',
    }),
    createTsServerProviderSession: () => ({
      async start() {
        return true
      },
      async stop() {
        return true
      },
      async requestHover() {
        throw new Error('No content available.')
      },
      async updateDocument() {},
      async closeDocument() {},
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'src/example.ts',
    language: 'typescript',
    content: 'export const value = 1\n',
  })

  const hover = await manager.request({
    kind: 'hover',
    projectFolder: projectRoot,
    filePath: 'src/example.ts',
    language: 'typescript',
    lineNumber: 1,
    column: 1,
  })

  assert.equal(hover?.ok, true)
  assert.equal(hover?.available, true)
  assert.deepEqual(hover?.contents, [])
  assert.equal(hover?.serviceState?.capabilities?.hover?.available, true)
  assert.equal(
    hover?.serviceState?.health?.providers?.find((provider) => provider.id === 'tsserver')?.status,
    'healthy',
  )
  await manager.dispose?.()
})

test('editor language-service manager ignores benign tsserver quickinfo stderr during no-content hover misses', async () => {
  const projectRoot = makeTempProject('addom-editor-service-hover-stderr-miss-')
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveTsServerRuntime: () => ({
      id: 'tsserver',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-tsserver.js'),
      message: 'Using fake tsserver.',
      reason: '',
    }),
    createTsServerProviderSession: (_resolution, { onFailure } = {}) => ({
      async start() {
        return true
      },
      async stop() {
        return true
      },
      async requestHover() {
        onFailure?.('TypeScript quickinfo exception: No content available.')
        throw new Error('No content available.')
      },
      async updateDocument() {},
      async closeDocument() {},
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath: 'src/example.mjs',
    language: 'javascript',
    content: 'export const value = 1\n',
  })

  const hover = await manager.request({
    kind: 'hover',
    projectFolder: projectRoot,
    filePath: 'src/example.mjs',
    language: 'javascript',
    lineNumber: 1,
    column: 1,
  })

  assert.equal(hover?.ok, true)
  assert.equal(hover?.available, true)
  assert.deepEqual(hover?.contents, [])
  assert.equal(
    hover?.serviceState?.health?.providers?.find((provider) => provider.id === 'tsserver')?.status,
    'healthy',
  )
  await manager.dispose?.()
})

test('editor language-service manager detects Java project roots from Maven and Gradle markers', () => {
  const projectRoot = makeTempProject('addom-editor-service-java-context-')
  writeFile(projectRoot, 'services/app/pom.xml', '<project />\n')
  writeFile(projectRoot, 'services/app/src/main/java/com/addom/App.java', 'package com.addom;\nclass App {}\n')

  const detectedRoot = detectNearestJavaProjectRoot(projectRoot, 'services/app/src/main/java/com/addom/App.java')

  assert.equal(detectedRoot, path.join(projectRoot, 'services/app'))
})

test('editor language-service manager enables C/C++ semantic capabilities through clangd when compile context exists', async () => {
  const projectRoot = makeTempProject('addom-editor-service-clangd-')
  copyFixtureDirectory('editor-cpp-semantic-workspace', projectRoot)
  const filePath = 'src/main.cpp'
  const content = fs.readFileSync(path.join(projectRoot, filePath), 'utf8')
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveClangdRuntime: () => ({
      id: 'clangd',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-clangd.js'),
      message: 'Using fake clangd.',
      reason: '',
    }),
    createClangdProviderSession: () => ({
      async start() { return true },
      async stop() { return true },
      async updateDocument() {},
      async closeDocument() {},
      async requestHover() {
        return {
          range: {
            startLineNumber: 3,
            startColumn: 13,
            endLineNumber: 3,
            endColumn: 18,
          },
          contents: [{ value: '```cpp\nstd::string greet(const std::string&)\n```' }],
        }
      },
      async requestDefinition() {
        return [{
          uri: 'file:///main.cpp',
          filePath: path.join(projectRoot, filePath),
          range: {
            startLineNumber: 3,
            startColumn: 1,
            endLineNumber: 5,
            endColumn: 2,
          },
        }]
      },
      async requestReferences() {
        return [
          {
            uri: 'file:///main.cpp',
            filePath: path.join(projectRoot, filePath),
            range: {
              startLineNumber: 3,
              startColumn: 13,
              endLineNumber: 3,
              endColumn: 18,
            },
          },
          {
            uri: 'file:///main.cpp',
            filePath: path.join(projectRoot, filePath),
            range: {
              startLineNumber: 7,
              startColumn: 27,
              endLineNumber: 7,
              endColumn: 32,
            },
          },
        ]
      },
      async requestSymbols() {
        return [{
          id: 'outline-greet',
          name: 'greet',
          kind: 'function',
          kindLabel: 'Function',
          kindBadge: { label: 'f', className: '' },
          modifiers: [],
          detail: '',
          rangeStartOffset: 22,
          rangeEndOffset: 91,
          selectionStartOffset: 34,
          selectionEndOffset: 39,
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 5,
          endColumn: 2,
          selectionLineNumber: 3,
          selectionColumn: 13,
          children: [],
        }]
      },
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
  })

  assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, true)

  const symbols = await manager.request({
    kind: 'symbols',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
  })
  const hover = await manager.request({
    kind: 'hover',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
    lineNumber: 7,
    column: 28,
  })
  const definition = await manager.request({
    kind: 'definition',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
    lineNumber: 7,
    column: 28,
  })
  const references = await manager.request({
    kind: 'references',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
    lineNumber: 7,
    column: 28,
  })

  assert.equal(symbols?.available, true)
  assert.equal(symbols?.outline?.items?.some((item) => item.name === 'greet'), true)
  assert.equal(hover?.available, true)
  assert.equal(Array.isArray(hover?.contents), true)
  assert.equal(definition?.locations?.length, 1)
  assert.equal(references?.locations?.length, 2)
  assert.equal(
    symbols?.serviceState?.health?.providers?.some((provider) => provider.id === 'clangd' && provider.status === 'healthy'),
    true,
  )
  await manager.dispose?.()
})

test('editor language-service manager keeps C/C++ semantic capabilities explicit when compile context is missing', async () => {
  const projectRoot = makeTempProject('addom-editor-service-clangd-missing-context-')
  const filePath = 'src/main.cpp'
  const content = 'int main() { return 0; }\n'
  writeFile(projectRoot, filePath, content)
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveClangdRuntime: () => ({
      id: 'clangd',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-clangd.js'),
      message: 'Using fake clangd.',
      reason: '',
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
    content,
  })

  const symbols = await manager.request({
    kind: 'symbols',
    projectFolder: projectRoot,
    filePath,
    language: 'cpp',
  })

  assert.equal(symbols?.available, false)
  assert.equal(symbols?.reason, 'real_provider_missing')
  assert.match(String(symbols?.message || ''), /compile_commands\.json|compile_flags\.txt/i)
  assert.equal(symbols?.serviceState?.capabilities?.symbols?.reason, 'real_provider_missing')
  await manager.dispose?.()
})

test('editor language-service manager enables C# semantic capabilities through csharp-ls when project context exists', async () => {
  const projectRoot = makeTempProject('addom-editor-service-csharp-ls-')
  copyFixtureDirectory('editor-csharp-semantic-workspace', projectRoot)
  const filePath = 'Program.cs'
  const content = fs.readFileSync(path.join(projectRoot, filePath), 'utf8')
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveCSharpLsRuntime: () => ({
      id: 'csharp-ls',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-csharp-ls.js'),
      message: 'Using fake csharp-ls.',
      reason: '',
    }),
    createCSharpLsProviderSession: () => ({
      async start() { return true },
      async stop() { return true },
      async updateDocument() {},
      async closeDocument() {},
      async requestHover() {
        return {
          range: {
            startLineNumber: 11,
            startColumn: 27,
            endLineNumber: 11,
            endColumn: 32,
          },
          contents: [{ value: '```csharp\nstring Greet(string name)\n```' }],
        }
      },
      async requestDefinition() {
        return [{
          uri: 'file:///Program.cs',
          filePath: path.join(projectRoot, filePath),
          range: {
            startLineNumber: 5,
            startColumn: 5,
            endLineNumber: 8,
            endColumn: 6,
          },
        }]
      },
      async requestReferences() {
        return [{
          uri: 'file:///Program.cs',
          filePath: path.join(projectRoot, filePath),
          range: {
            startLineNumber: 11,
            startColumn: 27,
            endLineNumber: 11,
            endColumn: 32,
          },
        }]
      },
      async requestSymbols() {
        return [{
          id: 'outline-greet-cs',
          name: 'Greet',
          kind: 'function',
          kindLabel: 'Function',
          kindBadge: { label: 'f', className: '' },
          modifiers: [],
          detail: '',
          rangeStartOffset: 60,
          rangeEndOffset: 145,
          selectionStartOffset: 88,
          selectionEndOffset: 93,
          startLineNumber: 5,
          startColumn: 5,
          endLineNumber: 8,
          endColumn: 6,
          selectionLineNumber: 5,
          selectionColumn: 27,
          children: [],
        }]
      },
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'csharp',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'csharp',
  })
  const symbols = await manager.request({
    kind: 'symbols',
    projectFolder: projectRoot,
    filePath,
    language: 'csharp',
  })
  const definition = await manager.request({
    kind: 'definition',
    projectFolder: projectRoot,
    filePath,
    language: 'csharp',
    lineNumber: 11,
    column: 28,
  })

  assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, true)
  assert.equal(symbols?.outline?.items?.some((item) => item.name === 'Greet'), true)
  assert.equal(definition?.locations?.length, 1)
  assert.equal(
    symbols?.serviceState?.health?.providers?.some((provider) => provider.id === 'csharp-ls' && provider.status === 'healthy'),
    true,
  )
  await manager.dispose?.()
})

test('editor language-service manager enables Java semantic, formatting, and code actions through jdtls', async () => {
  const projectRoot = makeTempProject('addom-editor-service-jdtls-')
  copyFixtureDirectory('editor-java-semantic-workspace', projectRoot)
  const filePath = path.join('src', 'main', 'java', 'com', 'addom', 'App.java')
  const content = fs.readFileSync(path.join(projectRoot, filePath), 'utf8')
  const formatted = content.replace('private App() {}', 'private App() {\n    }')
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveJdtlsRuntime: () => ({
      id: 'jdtls',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-jdtls.js'),
      message: 'Using fake jdtls.',
      reason: '',
    }),
    createJdtlsProviderSession: () => ({
      async start() { return true },
      async stop() { return true },
      async updateDocument() {},
      async closeDocument() {},
      async saveDocument() {},
      async requestHover() {
        return {
          range: {
            startLineNumber: 10,
            startColumn: 28,
            endLineNumber: 10,
            endColumn: 33,
          },
          contents: [{ value: '```java\nString greet(String name)\n```' }],
        }
      },
      async requestDefinition() {
        return [{
          uri: 'file:///App.java',
          filePath: path.join(projectRoot, filePath),
          range: {
            startLineNumber: 5,
            startColumn: 5,
            endLineNumber: 7,
            endColumn: 6,
          },
        }]
      },
      async requestReferences() {
        return [{
          uri: 'file:///App.java',
          filePath: path.join(projectRoot, filePath),
          range: {
            startLineNumber: 10,
            startColumn: 28,
            endLineNumber: 10,
            endColumn: 33,
          },
        }]
      },
      async requestSymbols() {
        return [{
          id: 'outline-greet-java',
          name: 'greet',
          kind: 'function',
          kindLabel: 'Function',
          kindBadge: { label: 'f', className: '' },
          modifiers: [],
          detail: '',
          rangeStartOffset: 55,
          rangeEndOffset: 113,
          selectionStartOffset: 82,
          selectionEndOffset: 87,
          startLineNumber: 5,
          startColumn: 5,
          endLineNumber: 7,
          endColumn: 6,
          selectionLineNumber: 5,
          selectionColumn: 19,
          children: [],
        }]
      },
      async requestFormatting() {
        return {
          changed: true,
          formatted,
        }
      },
      async requestCodeActions() {
        return [{
          id: 'java.organizeImports',
          title: 'Organize imports',
          kind: 'source.organizeImports',
          isPreferred: true,
          edit: {
            fullText: content,
          },
        }]
      },
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })
  const symbols = await manager.request({
    kind: 'symbols',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })
  const hover = await manager.request({
    kind: 'hover',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
    lineNumber: 10,
    column: 29,
  })
  const references = await manager.request({
    kind: 'references',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
    lineNumber: 10,
    column: 29,
  })
  const formatting = await manager.request({
    kind: 'formatting',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })
  const codeActions = await manager.request({
    kind: 'codeActions',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })

  assert.equal(diagnostics?.serviceState?.capabilities?.hover?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.definition?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.references?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.available, true)
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.available, true)
  assert.equal(symbols?.outline?.items?.some((item) => item.name === 'greet'), true)
  assert.equal(hover?.available, true)
  assert.equal(references?.locations?.length, 1)
  assert.equal(formatting?.available, true)
  assert.equal(formatting?.formatted, formatted)
  assert.equal(codeActions?.available, true)
  assert.equal(codeActions?.actions?.length, 1)
  assert.equal(codeActions?.actions?.[0]?.kind, 'source.organizeImports')
  assert.equal(
    codeActions?.serviceState?.health?.providers?.some((provider) => provider.id === 'jdtls' && provider.status === 'healthy'),
    true,
  )
  await manager.dispose?.()
})

test('editor language-service manager keeps Java provider states explicit when project context is missing', async () => {
  const projectRoot = makeTempProject('addom-editor-service-java-missing-context-')
  const filePath = path.join('src', 'main', 'java', 'com', 'addom', 'App.java')
  const content = 'package com.addom;\nclass App {}\n'
  writeFile(projectRoot, filePath, content)
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveJdtlsRuntime: () => ({
      id: 'jdtls',
      available: true,
      source: 'test-double',
      workspaceRoot: projectRoot,
      command: process.execPath,
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: path.join(projectRoot, 'fake-jdtls.js'),
      message: 'Using fake jdtls.',
      reason: '',
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })
  const formatting = await manager.request({
    kind: 'formatting',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })

  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.available, false)
  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.reason, 'real_provider_missing')
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'real_provider_missing')
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'real_provider_missing')
  assert.match(String(diagnostics?.serviceState?.capabilities?.symbols?.message || ''), /pom\.xml|build\.gradle/i)
  assert.equal(formatting?.available, false)
  assert.equal(formatting?.reason, 'real_provider_missing')
  await manager.dispose?.()
})

test('editor language-service manager reports missing jdtls binaries explicitly for Java semantic and editor actions', async () => {
  const projectRoot = makeTempProject('addom-editor-service-java-missing-binary-')
  copyFixtureDirectory('editor-java-semantic-workspace', projectRoot)
  const filePath = path.join('src', 'main', 'java', 'com', 'addom', 'App.java')
  const content = fs.readFileSync(path.join(projectRoot, filePath), 'utf8')
  const manager = __testEditorLanguageServiceManagerInternals.createEditorLanguageServiceManager({
    resolveJdtlsRuntime: () => ({
      id: 'jdtls',
      available: false,
      source: 'missing-provider-binary',
      workspaceRoot: projectRoot,
      command: '',
      args: [],
      env: {},
      cwd: projectRoot,
      executablePath: '',
      message: 'jdtls was not found in this project or on PATH.',
      reason: 'missing_provider_binary',
    }),
  })

  manager.syncDocument({
    event: 'open',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
    content,
  })

  const diagnostics = await manager.request({
    kind: 'diagnostics',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })
  const symbols = await manager.request({
    kind: 'symbols',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })
  const formatting = await manager.request({
    kind: 'formatting',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })
  const codeActions = await manager.request({
    kind: 'codeActions',
    projectFolder: projectRoot,
    filePath,
    language: 'java',
  })

  assert.equal(diagnostics?.serviceState?.capabilities?.hover?.reason, 'missing_provider_binary')
  assert.equal(diagnostics?.serviceState?.capabilities?.symbols?.reason, 'missing_provider_binary')
  assert.equal(diagnostics?.serviceState?.capabilities?.formatting?.reason, 'missing_provider_binary')
  assert.equal(diagnostics?.serviceState?.capabilities?.codeActions?.reason, 'missing_provider_binary')
  assert.match(String(diagnostics?.serviceState?.capabilities?.formatting?.message || ''), /jdtls/i)
  assert.equal(symbols?.reason, 'missing_provider_binary')
  assert.equal(formatting?.reason, 'missing_provider_binary')
  assert.equal(codeActions?.reason, 'missing_provider_binary')
  await manager.dispose?.()
})
