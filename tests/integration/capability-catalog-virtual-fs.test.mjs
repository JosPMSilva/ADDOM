import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  CAPABILITY_CATALOG_INDEX_PATH,
  buildCapabilityCatalogPath,
} from '../../src/main/tools/capability-catalog-builder.mjs'
import {
  isCapabilityCatalogVirtualPath,
  normalizeCapabilityCatalogVirtualPath,
  readCapabilityCatalogVirtualFile,
  searchCapabilityCatalogVirtualFiles,
} from '../../src/main/tools/capability-catalog-virtual-fs.mjs'
import {
  editFile,
  readFile,
  searchCode,
  writeFile,
} from '../../src/main/tools/file-tools.mjs'
import { executeTool } from '../../src/main/tools/fs-tool-executor.mjs'

async function withTempProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-capability-catalog-vfs-'))
  try {
    return await fn(projectRoot)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
}

function writeRaw(projectRoot, relPath, content = '') {
  const abs = path.join(projectRoot, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
}

test('virtual catalog path detection is explicit to addom capabilities URIs', () => {
  assert.equal(isCapabilityCatalogVirtualPath('addom://capabilities'), true)
  assert.equal(isCapabilityCatalogVirtualPath('addom://capabilities/files.md'), true)
  assert.equal(isCapabilityCatalogVirtualPath('addom://capabilities-extra/files.md'), false)
  assert.equal(isCapabilityCatalogVirtualPath('docs/addom://capabilities/files.md'), false)
  assert.equal(normalizeCapabilityCatalogVirtualPath('addom://capabilities'), CAPABILITY_CATALOG_INDEX_PATH)
  assert.equal(normalizeCapabilityCatalogVirtualPath('addom://capabilities/'), CAPABILITY_CATALOG_INDEX_PATH)
})

test('read_file routes known addom capability pages to the virtual catalog', async () => {
  await withTempProject(async (projectRoot) => {
    const index = await readFile(projectRoot, { path: 'addom://capabilities' })
    assert.match(index, /# ADDOM Capability Catalog/)
    assert.match(index, /\[Files\]\(addom:\/\/capabilities\/files\.md\)/)

    const filesPage = await readCapabilityCatalogVirtualFile({ path: buildCapabilityCatalogPath('files') })
    assert.match(filesPage, /# Files/)
    assert.match(filesPage, /`read_file`/)
    assert.equal(fs.existsSync(path.join(projectRoot, 'addom:')), false)
  })
})

test('virtual catalog read rejects unknown or malformed pages', async () => {
  await assert.rejects(
    () => readCapabilityCatalogVirtualFile({ path: 'addom://capabilities/unknown.md' }),
    /Capability catalog page not found/i,
  )
  await assert.rejects(
    () => readCapabilityCatalogVirtualFile({ path: 'addom://capabilities/../package.json' }),
    /Invalid capability catalog path/i,
  )
})

test('search_code routes explicit addom capability searches to virtual pages', async () => {
  await withTempProject(async (projectRoot) => {
    const output = await searchCode(projectRoot, {
      path: 'addom://capabilities',
      query: 'terminal sessions',
      limit: 5,
    })

    assert.match(output, /Showing \d+ match\(es\)/)
    assert.match(output, /addom:\/\/capabilities\/index\.md:\d+:/)
    assert.match(output, /addom:\/\/capabilities\/terminal-sessions\.md:\d+:/)

    const pageOnly = await searchCapabilityCatalogVirtualFiles({
      path: 'addom://capabilities/git.md',
      query: 'git_status',
    })
    assert.match(pageOnly, /addom:\/\/capabilities\/git\.md:\d+:/)
  })
})

test('virtual catalog read and search record dev-only diagnostics when supplied', async () => {
  await withTempProject(async (projectRoot) => {
    const errorDiagnostics = { runtimeDiagnosticsVisible: true }

    await executeTool(projectRoot, 'read_file', {
      path: 'addom://capabilities/files.md',
    }, { errorDiagnostics })
    await executeTool(projectRoot, 'search_code', {
      path: 'addom://capabilities',
      query: 'git_status',
      limit: 3,
    }, { errorDiagnostics })

    assert.deepEqual(errorDiagnostics.devToolSurfaceCatalogOperationCounts, {
      read: 1,
      search: 1,
    })
    assert.deepEqual(
      errorDiagnostics.devToolSurfaceCatalogOperations.map((row) => row.operation),
      ['read', 'search'],
    )
    assert.equal(errorDiagnostics.devToolSurfaceCatalogOperations[0].path, 'addom://capabilities/files.md')
    assert.equal(errorDiagnostics.devToolSurfaceCatalogOperations[1].path, 'addom://capabilities')
    assert.equal(errorDiagnostics.devToolSurfaceCatalogOperations[1].matchCount > 0, true)
  })
})

test('normal workspace search does not mix in virtual catalog snippets', async () => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'src/app.js', 'const value = "workspace only";\n')

    const workspaceResult = await searchCode(projectRoot, {
      path: '.',
      query: 'Terminal Sessions',
    })
    assert.match(workspaceResult, /No matches found/i)

    const catalogResult = await searchCode(projectRoot, {
      path: 'addom://capabilities',
      query: 'Terminal Sessions',
    })
    assert.match(catalogResult, /addom:\/\/capabilities\/terminal-sessions\.md:\d+:/)
  })
})

test('write and mutate tools reject virtual catalog paths', async () => {
  await withTempProject(async (projectRoot) => {
    await assert.rejects(
      () => writeFile(projectRoot, { path: 'addom://capabilities/files.md', content: 'nope' }),
      /virtual catalog path|virtual read-only catalog/i,
    )
    await assert.rejects(
      () => editFile(projectRoot, {
        path: 'addom://capabilities/files.md',
        old_text: 'Files',
        new_text: 'Changed',
      }),
      /virtual catalog path|virtual read-only catalog/i,
    )
    await assert.rejects(
      () => executeTool(projectRoot, 'write_file', {
        path: 'addom://capabilities/files.md',
        content: 'nope',
      }),
      /virtual read-only catalog/i,
    )
    await assert.rejects(
      () => executeTool(projectRoot, 'apply_patch', {
        patch: [
          '*** Begin Patch',
          '*** Add File: addom://capabilities/new.md',
          '+nope',
          '*** End Patch',
        ].join('\n'),
      }),
      /virtual read-only catalog/i,
    )
  })
})
