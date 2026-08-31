import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const MATRIX_PATH = new URL(
  '../fixtures/agent-runtime-phase12/conformance-matrix.json',
  import.meta.url,
)
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..')

const REQUIRED_CLASSES = [
  'managed_recursive_hierarchy',
  'native_hierarchical_projection',
  'partial_native_projection',
  'opaque_provider_managed_child',
  'missing_or_unknown_scope_usage',
  'reconnect_provider_ahead',
  'unsupported_child_controls',
  'cross_project_concurrency',
]

async function assertEvidenceReference(reference, label) {
  assert.equal(typeof reference?.file, 'string', `${label} file is required`)
  assert.equal(typeof reference?.test, 'string', `${label} test name is required`)
  const filePath = path.resolve(REPOSITORY_ROOT, reference.file)
  assert.equal(filePath.startsWith(`${REPOSITORY_ROOT}${path.sep}`), true, `${label} escapes the repository`)
  const source = await fs.readFile(filePath, 'utf8')
  assert.match(source, new RegExp(reference.test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${label} test is missing`)
}

test('Phase 12 capability rows each name offline fixture and backend/reload/renderer/control evidence', async () => {
  const matrix = JSON.parse(await fs.readFile(MATRIX_PATH, 'utf8'))
  assert.equal(matrix.schemaVersion, 1)
  assert.deepEqual(matrix.rows.map((row) => row.capabilityClass), REQUIRED_CLASSES)
  assert.equal(new Set(matrix.rows.map((row) => row.fixtureId)).size, REQUIRED_CLASSES.length)

  for (const row of matrix.rows) {
    assert.match(row.fixtureId, /^phase12-[a-z0-9-]+$/)
    assert.equal(row.sanitized, true)
    assert.equal(row.networkRequired, false)
    assert.ok(['captured_fixture', 'synthetic_contract'].includes(row.sourceClass))
    assert.equal(typeof row.adapterDeclaration, 'string')
    await fs.access(path.resolve(REPOSITORY_ROOT, row.adapterDeclaration))
    await assertEvidenceReference(row.backendConformance, `${row.capabilityClass} backend`)
    await assertEvidenceReference(row.reloadReconciliation, `${row.capabilityClass} reload`)
    await assertEvidenceReference(row.rendererChronology, `${row.capabilityClass} renderer`)
    await assertEvidenceReference(row.controlConformance, `${row.capabilityClass} control`)
    assert.equal(typeof row.claim, 'string')
    assert.equal(typeof row.releaseDisposition, 'string')
  }
})
