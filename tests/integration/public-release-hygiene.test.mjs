import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('.')

const EXCLUDED_RELEASE_PATHS = [
  '.agents',
  '.opencode',
  '.playwright-cli',
  '.reference',
  'dev-docs',
  'dev-tools',
  'calculator.py',
  'opencode.jsonc',
  'tests/fixtures/model-catalog/opencode-reasoning-effort-matrix.json',
  'package_backup.json',
  'PLAN.md',
]

const TEXT_SCAN_ROOTS = [
  'src',
  'tests',
  'scripts',
  'docs',
  '.github',
]

const TEXT_SCAN_EXCLUDED_DIRECTORIES = new Set(['node_modules'])

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ps1', '.txt', '.yml', '.yaml',
])

function walkTextFiles(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot)
  if (!fs.existsSync(absoluteRoot)) return []

  const files = []
  const pending = [absoluteRoot]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory() && !TEXT_SCAN_EXCLUDED_DIRECTORIES.has(entry.name)) pending.push(entryPath)
      else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(entryPath)
    }
  }
  return files
}

function containsPrivateWorkstationPath(text = '') {
  const forbidden = /C:[/\\]+Users[/\\]+(?!(?:example|me|test)[/\\]+)[a-z0-9][a-z0-9._-]*[/\\]+|\/Users\/(?!(?:example|me|test)\/)[a-z0-9][a-z0-9._-]*\//iu
  return forbidden.test(String(text || ''))
}

test('public export contains only release-owned top-level material', () => {
  for (const relativePath of EXCLUDED_RELEASE_PATHS) {
    assert.equal(fs.existsSync(path.join(ROOT, relativePath)), false, `${relativePath} must not be public`)
  }
})

test('public export declares the MIT license consistently', () => {
  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const planProfiles = fs.readFileSync(path.join(ROOT, 'src/main/chat/plan-authoring-profiles.mjs'), 'utf8')
  const aboutBlock = fs.readFileSync(path.join(ROOT, 'src/renderer/components/settings/SettingsBlocksGovernance.jsx'), 'utf8')

  assert.match(license, /^MIT License\r?\n/)
  assert.equal(packageJson.license, 'MIT')
  assert.doesNotMatch(planProfiles, /ADDOM-Proprietary/)
  assert.match(aboutBlock, /MIT License/)
  assert.doesNotMatch(aboutBlock, /Proprietary software|All rights reserved/)
})

test('public text does not contain the private workstation identity or paths', () => {
  const violations = []

  for (const filePath of TEXT_SCAN_ROOTS.flatMap(walkTextFiles)) {
    if (containsPrivateWorkstationPath(fs.readFileSync(filePath, 'utf8'))) {
      violations.push(path.relative(ROOT, filePath).replaceAll('\\', '/'))
    }
  }

  assert.deepEqual(violations, [])
})

test('public path scanner rejects real profile names while allowing documented placeholders', () => {
  const windowsPrivatePath = ['C:', 'Users', 'local-account', 'Documents', 'ADDOM'].join('\\')
  const macPrivatePath = ['', 'Users', 'local-account', 'Documents', 'ADDOM'].join('/')
  const windowsExamplePath = ['C:', 'Users', 'example', 'Documents', 'ADDOM'].join('\\')
  const macExamplePath = ['', 'Users', 'me', 'Documents', 'ADDOM'].join('/')

  assert.equal(containsPrivateWorkstationPath(windowsPrivatePath), true)
  assert.equal(containsPrivateWorkstationPath(macPrivatePath), true)
  assert.equal(containsPrivateWorkstationPath(windowsExamplePath), false)
  assert.equal(containsPrivateWorkstationPath(macExamplePath), false)
})
