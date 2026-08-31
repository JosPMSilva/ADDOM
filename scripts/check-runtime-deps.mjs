import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'

const ROOT = process.cwd()
const RUNTIME_DIRS = [
  path.join(ROOT, 'src', 'main'),
  path.join(ROOT, 'src', 'preload'),
  path.join(ROOT, 'src', 'common'),
]
const ALLOWED_EXTERNALS = new Set([
  'electron',
])

function collectRuntimeFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectRuntimeFiles(fullPath, results)
      continue
    }
    if (entry.isFile() && /\.(mjs|js|cjs)$/.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

function toPackageRoot(specifier) {
  if (!specifier) return ''
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/')
  }
  return specifier.split('/')[0]
}

function isBareRuntimeImport(specifier, builtins) {
  return (
    specifier
    && !specifier.startsWith('.')
    && !specifier.startsWith('/')
    && !builtins.has(specifier)
  )
}

function collectSpecifiers(sourceText) {
  const specifiers = new Set()
  const importExportPattern = /(?:import|export)\s+(?:[^'"`]*?from\s*)?['"]([^'"\n]+)['"]/g
  const dynamicImportPattern = /import\(\s*['"]([^'"\n]+)['"]\s*\)/g
  const requirePattern = /require\(\s*['"]([^'"\n]+)['"]\s*\)/g

  for (const pattern of [importExportPattern, dynamicImportPattern, requirePattern]) {
    let match
    while ((match = pattern.exec(sourceText))) {
      specifiers.add(match[1])
    }
  }

  return specifiers
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const declaredDependencies = new Set(Object.keys(pkg.dependencies || {}))
const builtins = new Set(
  builtinModules.flatMap((name) => (name.startsWith('node:') ? [name, name.slice(5)] : [name, `node:${name}`])),
)

const failures = []
for (const filePath of RUNTIME_DIRS.flatMap((dir) => collectRuntimeFiles(dir))) {
  const sourceText = fs.readFileSync(filePath, 'utf8')
  for (const specifier of collectSpecifiers(sourceText)) {
    if (!isBareRuntimeImport(specifier, builtins)) continue
    const packageRoot = toPackageRoot(specifier)
    if (ALLOWED_EXTERNALS.has(packageRoot) || declaredDependencies.has(packageRoot)) continue
    failures.push({
      filePath: path.relative(ROOT, filePath),
      specifier,
      packageRoot,
    })
  }
}

if (failures.length > 0) {
  console.error('Missing production dependencies for packaged runtime imports:')
  for (const failure of failures) {
    console.error(`- ${failure.filePath}: ${failure.specifier} (declare "${failure.packageRoot}" in dependencies)`)
  }
  process.exit(1)
}

console.log('Runtime dependency audit passed.')
