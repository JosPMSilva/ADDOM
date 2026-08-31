import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  __testEditorProviderDiscoveryInternals,
  resolveClangdRuntime,
  resolveCSharpLsRuntime,
  resolveJdtlsRuntime,
} from '../../src/main/editor/editor-provider-discovery.mjs'

const tempDirs = new Set()
const originalPath = process.env.PATH
const originalJavaHome = process.env.JAVA_HOME

function makeTempDir(prefix = 'addom-provider-discovery-') {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.add(dirPath)
  return dirPath
}

test.after(async () => {
  process.env.PATH = originalPath
  process.env.JAVA_HOME = originalJavaHome
  for (const dirPath of tempDirs) {
    await fs.promises.rm(dirPath, { recursive: true, force: true })
  }
  tempDirs.clear()
})

function prependPath(dirPath) {
  const currentPath = process.env.PATH || ''
  process.env.PATH = currentPath ? `${dirPath}${path.delimiter}${currentPath}` : dirPath
}

function normalizeCommandPathForAssertion(targetPath) {
  const normalized = String(targetPath || '').trim()
  if (!normalized) return ''
  try {
    const resolved = fs.realpathSync.native(normalized)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  } catch {
    const resolved = path.resolve(normalized)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
}

function makeExecutableScript(targetPath, body = '') {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, body || '@echo off\r\nexit /b 0\r\n', 'utf8')
  if (process.platform !== 'win32') {
    fs.chmodSync(targetPath, 0o755)
  }
  return targetPath
}

test('editor provider discovery prefers a runnable Windows wrapper over a bare shim path', () => {
  const tempDir = makeTempDir()
  const bareShim = path.join(tempDir, 'pyright-langserver')
  const cmdShim = `${bareShim}.cmd`
  fs.writeFileSync(cmdShim, '@echo off\r\n', 'utf8')

  const selected = __testEditorProviderDiscoveryInternals.selectRunnableWindowsCommand([
    bareShim,
    cmdShim,
  ])

  assert.equal(selected, cmdShim)
})

test('editor provider discovery preserves Windows cmd wrappers for shell spawning', () => {
  if (process.platform !== 'win32') return

  const resolution = __testEditorProviderDiscoveryInternals.createCommandResolution({
    id: 'pyright',
    source: 'system-installed',
    workspaceRoot: 'C:\\workspace',
    command: 'C:\\workspace\\node_modules\\.bin\\pyright-langserver.cmd',
    args: ['--stdio'],
    executablePath: 'C:\\workspace\\node_modules\\.bin\\pyright-langserver.cmd',
  })

  assert.equal(resolution.command, 'C:\\workspace\\node_modules\\.bin\\pyright-langserver.cmd')
  assert.deepEqual(resolution.args, ['--stdio'])
})

test('editor provider discovery resolves project-local clangd runtimes', () => {
  const projectRoot = makeTempDir('addom-provider-discovery-clangd-')
  const localBinary = process.platform === 'win32'
    ? path.join(projectRoot, 'tools', 'clangd.cmd')
    : path.join(projectRoot, 'tools', 'clangd')
  makeExecutableScript(localBinary, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n')

  const resolution = resolveClangdRuntime(projectRoot, 'src/main.cpp')

  assert.equal(resolution.available, true)
  assert.equal(resolution.source, 'project-local')
  assert.equal(resolution.command, localBinary)
  assert.deepEqual(resolution.args, ['--log=error'])
})

test('editor provider discovery resolves project-local csharp-ls dotnet tool manifests', () => {
  const projectRoot = makeTempDir('addom-provider-discovery-csharp-ls-')
  const dotnetDir = path.join(projectRoot, '.fake-dotnet-bin')
  const dotnetCommand = process.platform === 'win32'
    ? path.join(dotnetDir, 'dotnet.cmd')
    : path.join(dotnetDir, 'dotnet')
  const previousPath = process.env.PATH
  try {
    makeExecutableScript(dotnetCommand, process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
    prependPath(dotnetDir)

    const manifestPath = path.join(projectRoot, '.config', 'dotnet-tools.json')
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      isRoot: true,
      tools: {
        'csharp-ls': {
          version: '0.0.1',
          commands: ['csharp-ls'],
        },
      },
    }, null, 2))

    const resolution = resolveCSharpLsRuntime(projectRoot, 'Program.cs')

    assert.equal(resolution.available, true)
    assert.equal(resolution.source, 'project-local')
    assert.equal(
      normalizeCommandPathForAssertion(resolution.command),
      normalizeCommandPathForAssertion(dotnetCommand),
    )
    assert.deepEqual(resolution.args, ['tool', 'run', 'csharp-ls', '--'])
    assert.equal(resolution.executablePath, manifestPath)
  } finally {
    process.env.PATH = previousPath
  }
})

test('editor provider discovery reports missing dotnet for local csharp-ls manifests', () => {
  const projectRoot = makeTempDir('addom-provider-discovery-csharp-ls-missing-dotnet-')
  const previousPath = process.env.PATH
  try {
    process.env.PATH = ''

    const manifestPath = path.join(projectRoot, '.config', 'dotnet-tools.json')
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      isRoot: true,
      tools: {
        'csharp-ls': {
          version: '0.0.1',
          commands: ['csharp-ls'],
        },
      },
    }, null, 2))

    const resolution = resolveCSharpLsRuntime(projectRoot, 'Program.cs')

    assert.equal(resolution.available, false)
    assert.equal(resolution.reason, 'dotnet_not_installed')
    assert.match(String(resolution.message || ''), /dotnet/i)
  } finally {
    process.env.PATH = previousPath
  }
})

test('editor provider discovery resolves jdtls when the runtime and JDK are available', () => {
  const projectRoot = makeTempDir('addom-provider-discovery-jdtls-')
  const binDir = path.join(projectRoot, '.fake-java-bin')
  const jdtlsCommand = process.platform === 'win32'
    ? path.join(binDir, 'jdtls.cmd')
    : path.join(binDir, 'jdtls')
  const javaCommand = process.platform === 'win32'
    ? path.join(binDir, 'java.cmd')
    : path.join(binDir, 'java')
  const previousPath = process.env.PATH
  const previousJavaHome = process.env.JAVA_HOME
  try {
    makeExecutableScript(jdtlsCommand, process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
    makeExecutableScript(javaCommand, process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
    prependPath(binDir)
    delete process.env.JAVA_HOME

    const resolution = resolveJdtlsRuntime(projectRoot, 'src/main/java/com/addom/App.java')

    assert.equal(resolution.available, true)
    assert.equal(resolution.source, 'system-installed')
    assert.equal(
      normalizeCommandPathForAssertion(resolution.command),
      normalizeCommandPathForAssertion(jdtlsCommand),
    )
  } finally {
    process.env.PATH = previousPath
    process.env.JAVA_HOME = previousJavaHome
  }
})

test('editor provider discovery reports a missing JDK for jdtls with an explicit message', () => {
  const projectRoot = makeTempDir('addom-provider-discovery-jdtls-missing-java-')
  const jdtlsCommand = process.platform === 'win32'
    ? path.join(projectRoot, 'bin', 'jdtls.cmd')
    : path.join(projectRoot, 'bin', 'jdtls')
  const previousPath = process.env.PATH
  const previousJavaHome = process.env.JAVA_HOME
  try {
    makeExecutableScript(jdtlsCommand, process.platform === 'win32' ? '@echo off\r\nexit /b 0\r\n' : '#!/bin/sh\nexit 0\n')
    process.env.PATH = ''
    delete process.env.JAVA_HOME

    const resolution = resolveJdtlsRuntime(projectRoot, 'src/main/java/com/addom/App.java')

    assert.equal(resolution.available, false)
    assert.equal(resolution.reason, 'java_not_installed')
    assert.match(String(resolution.message || ''), /JDK|Java/i)
  } finally {
    process.env.PATH = previousPath
    process.env.JAVA_HOME = previousJavaHome
  }
})
