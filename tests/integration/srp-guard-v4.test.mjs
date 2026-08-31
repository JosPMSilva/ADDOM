import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()

function readLineCount(relativePath) {
  const abs = path.join(ROOT, relativePath)
  const content = fs.readFileSync(abs, 'utf8')
  return content.split(/\r?\n/).length
}

test('V4 SRP guard enforces guarded file line-count limits', () => {
  const limits = [
    { file: 'src/main/ipc-handlers/chat.mjs', max: 1000 },
    { file: 'src/main/tools/agent-executor.mjs', max: 900 },
    { file: 'src/main/tools/fs-tools.mjs', max: 900 },
    { file: 'src/renderer/components/SettingsPanel.jsx', max: 400 },
    { file: 'src/renderer/store/useChatStore.js', max: 1150 },
  ]

  for (const { file, max } of limits) {
    const lines = readLineCount(file)
    assert.ok(
      lines <= max,
      `${file} exceeded SRP guard (${lines} > ${max})`,
    )
  }
})

test('max-line guard enforces the source 800-line ratchet by default', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/check-max-lines.mjs'), 'utf8')

  assert.match(source, /CHECK_TESTS_AND_SCRIPTS/)
  assert.match(source, /SOURCE_MAX_FILE_LINES = Number\(process\.env\.MAX_FILE_LINES \|\| 800\)/)
  assert.match(source, /SCAN_ROOTS = INCLUDE_TESTS_AND_SCRIPTS \? \['src', 'tests', 'scripts'\] : \['src'\]/)
  assert.match(source, /GRANDFATHERED_MAX_LINES/)
  assert.match(source, /reason: 'Legacy source hotspot pending follow-up decomposition\.'/)
})
