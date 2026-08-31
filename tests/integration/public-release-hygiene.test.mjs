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
      if (entry.isDirectory()) pending.push(entryPath)
      else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(entryPath)
    }
  }
  return files
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
  const forbidden = /C:[/\\]Users[/\\]compw|\/Users\/compw|AppData[/\\](?:Local|Roaming)[/\\]addom-dev/iu
  const violations = []

  for (const filePath of TEXT_SCAN_ROOTS.flatMap(walkTextFiles)) {
    if (forbidden.test(fs.readFileSync(filePath, 'utf8'))) {
      violations.push(path.relative(ROOT, filePath).replaceAll('\\', '/'))
    }
  }

  assert.deepEqual(violations, [])
})
