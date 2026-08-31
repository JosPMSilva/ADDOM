import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { groupFiles, shouldUseFullSyntaxScan } from '../../scripts/check-staged-syntax.mjs'

test('check-staged-syntax groups only existing syntax-relevant files and dedupes renamed paths', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-check-staged-syntax-'))

  try {
    await fs.mkdir(path.join(tempRoot, 'src', 'renderer'), { recursive: true })
    await fs.mkdir(path.join(tempRoot, 'scripts'), { recursive: true })
    await fs.mkdir(path.join(tempRoot, 'config'), { recursive: true })

    await fs.writeFile(path.join(tempRoot, 'src', 'renderer', 'panel.jsx'), 'export default function Panel() { return null }\n', 'utf8')
    await fs.writeFile(path.join(tempRoot, 'src', 'renderer', 'bridge.mjs'), 'export const bridge = true\n', 'utf8')
    await fs.writeFile(path.join(tempRoot, 'scripts', 'check.mjs'), 'export const ok = true\n', 'utf8')
    await fs.writeFile(path.join(tempRoot, 'config', 'settings.json'), '{}\n', 'utf8')
    await fs.writeFile(path.join(tempRoot, 'scripts', 'setup.ps1'), '$true\n', 'utf8')

    const groups = groupFiles([
      'src/renderer/panel.jsx',
      'src\\renderer\\panel.jsx',
      'src/renderer/bridge.mjs',
      'scripts/check.mjs',
      'config/settings.json',
      'scripts/setup.ps1',
      'src/renderer/missing.jsx',
      'dist/renderer.js',
      'dist-electron/main.js',
    ], { repoRoot: tempRoot })

    assert.deepEqual(groups, {
      node: ['scripts/check.mjs'],
      renderer: ['src/renderer/panel.jsx', 'src/renderer/bridge.mjs'],
      json: ['config/settings.json'],
      powershell: ['scripts/setup.ps1'],
    })
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('check-staged-syntax uses a full scan when an initial commit exceeds command-line limits', () => {
  const largeInitialCommit = Array.from(
    { length: 1_000 },
    (_, index) => `tests/integration/generated-contract-${String(index).padStart(4, '0')}.test.mjs`,
  )

  assert.equal(shouldUseFullSyntaxScan(['src/main/index.mjs']), false)
  assert.equal(shouldUseFullSyntaxScan(largeInitialCommit), true)
})
