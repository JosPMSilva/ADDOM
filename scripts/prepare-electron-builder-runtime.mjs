import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const ELECTRON_BUILDER_PATCH_TARGET = path.join(
  'node_modules',
  'app-builder-lib',
  'out',
  'util',
  'appFileCopier.js',
)
export const ELECTRON_BUILDER_MODULE_MANAGER_PATCH_TARGET = path.join(
  'node_modules',
  'app-builder-lib',
  'out',
  'node-module-collector',
  'moduleManager.js',
)

const ORIGINAL_PM_APPROACHES = '    const pmApproaches = [await packager.getPackageManager(), node_module_collector_1.PM.TRAVERSAL];'
const PATCHED_PM_APPROACHES = `    const forceTraversal = String(process.env.ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL || "").trim() === "1";
    const pmApproaches = forceTraversal
        ? [node_module_collector_1.PM.TRAVERSAL]
        : [await packager.getPackageManager(), node_module_collector_1.PM.TRAVERSAL];`
const ORIGINAL_OPTIONAL_DEP_LOG_LEVEL = '    [LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED]: "info",'
const PATCHED_OPTIONAL_DEP_LOG_LEVEL = '    [LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED]: "debug",'

export function applyElectronBuilderTraversalPatch(source) {
  if (source.includes('ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL')) return source
  if (!source.includes(ORIGINAL_PM_APPROACHES)) {
    throw new Error('Electron Builder collector patch target not found. app-builder-lib layout may have changed.')
  }
  return source.replace(ORIGINAL_PM_APPROACHES, PATCHED_PM_APPROACHES)
}

export function applyElectronBuilderOptionalDependencyLogPatch(source) {
  if (source.includes(PATCHED_OPTIONAL_DEP_LOG_LEVEL)) return source
  if (!source.includes(ORIGINAL_OPTIONAL_DEP_LOG_LEVEL)) {
    throw new Error('Electron Builder optional dependency log patch target not found. moduleManager layout may have changed.')
  }
  return source.replace(ORIGINAL_OPTIONAL_DEP_LOG_LEVEL, PATCHED_OPTIONAL_DEP_LOG_LEVEL)
}

export async function prepareElectronBuilderRuntime({ cwd = process.cwd() } = {}) {
  const patchTargets = [
    {
      targetPath: path.join(cwd, ELECTRON_BUILDER_PATCH_TARGET),
      applyPatch: applyElectronBuilderTraversalPatch,
    },
    {
      targetPath: path.join(cwd, ELECTRON_BUILDER_MODULE_MANAGER_PATCH_TARGET),
      applyPatch: applyElectronBuilderOptionalDependencyLogPatch,
    },
  ]

  const results = []
  for (const { targetPath, applyPatch } of patchTargets) {
    const source = await fs.readFile(targetPath, 'utf8')
    const patched = applyPatch(source)
    const changed = patched !== source
    if (changed) {
      await fs.writeFile(targetPath, patched, 'utf8')
    }
    results.push({ targetPath, changed })
  }

  return {
    changed: results.some((result) => result.changed),
    results,
    targetPath: results[0]?.targetPath || '',
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  const result = await prepareElectronBuilderRuntime()
  for (const entry of result.results || []) {
    console.log(`[electron-builder-runtime] ${entry.changed ? 'patched' : 'already patched'} ${entry.targetPath}`)
  }
}
