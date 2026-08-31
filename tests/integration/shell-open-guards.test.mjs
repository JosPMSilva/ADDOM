import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  validateAttachmentOpenRequest,
  validateExternalHttpUrl,
  validateOpenDirectoryPath,
} from '../../src/main/utils/shell-open-guards.mjs'

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('validateOpenDirectoryPath only allows existing directories under known project roots', async () => {
  const projectRoot = createTempDir('addom-shell-open-')
  const nestedDir = path.join(projectRoot, 'docs')
  fs.mkdirSync(nestedDir, { recursive: true })

  assert.deepEqual(
    await validateOpenDirectoryPath(path.join(projectRoot, 'missing'), [projectRoot]),
    { ok: false, error: 'path_not_found' },
  )

  assert.deepEqual(
    await validateOpenDirectoryPath(nestedDir, [projectRoot]),
    { ok: true, path: path.resolve(nestedDir) },
  )

  const outsideRoot = createTempDir('addom-shell-open-outside-')
  assert.deepEqual(
    await validateOpenDirectoryPath(outsideRoot, [projectRoot]),
    { ok: false, error: 'path_not_allowed' },
  )

  const filePath = path.join(projectRoot, 'readme.txt')
  fs.writeFileSync(filePath, 'hello', 'utf8')
  assert.deepEqual(
    await validateOpenDirectoryPath(filePath, [projectRoot]),
    { ok: false, error: 'not_a_directory' },
  )
})

test('validateAttachmentOpenRequest blocks executable attachment types by extension or MIME type', () => {
  assert.deepEqual(
    validateAttachmentOpenRequest({ mediaType: 'application/pdf', extension: '.pdf' }),
    { ok: true },
  )

  assert.deepEqual(
    validateAttachmentOpenRequest({ mediaType: 'application/x-msdownload', extension: '.txt' }),
    {
      ok: false,
      error: 'blocked_mime_type',
      detail: 'MIME type application/x-msdownload is not allowed.',
    },
  )

  assert.deepEqual(
    validateAttachmentOpenRequest({ mediaType: 'text/plain', extension: '.ps1' }),
    {
      ok: false,
      error: 'blocked_extension',
      detail: 'Extension .ps1 is not allowed.',
    },
  )
})

test('validateExternalHttpUrl accepts normalized http/https URLs and rejects other input', () => {
  assert.deepEqual(
    validateExternalHttpUrl('https://example.com/docs?q=1'),
    { ok: true, url: 'https://example.com/docs?q=1' },
  )

  assert.deepEqual(
    validateExternalHttpUrl('  https://example.com/docs?q=1#hash  '),
    { ok: true, url: 'https://example.com/docs?q=1#hash' },
  )

  assert.deepEqual(
    validateExternalHttpUrl(''),
    { ok: false, error: 'url_required' },
  )

  assert.deepEqual(
    validateExternalHttpUrl('not a url'),
    { ok: false, error: 'invalid_url' },
  )

  assert.deepEqual(
    validateExternalHttpUrl('file:///tmp/demo.txt'),
    { ok: false, error: 'unsupported_protocol' },
  )

  assert.deepEqual(
    validateExternalHttpUrl('javascript:alert(1)'),
    { ok: false, error: 'unsupported_protocol' },
  )
})
