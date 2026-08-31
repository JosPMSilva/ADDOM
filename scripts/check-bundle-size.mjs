import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const DIST_DIR = path.join(ROOT, 'dist')
const DIST_INDEX_HTML = path.join(DIST_DIR, 'index.html')
const ASSETS_DIR = path.join(ROOT, 'dist', 'assets')

const MAX_RENDERER_INDEX_JS_KB = Number(process.env.MAX_RENDERER_INDEX_JS_KB || 6700)
const MAX_MONACO_TS_WORKER_KB = Number(process.env.MAX_MONACO_TS_WORKER_KB || 7200)
const MAX_RENDERER_INDEX_CSS_KB = Number(process.env.MAX_RENDERER_INDEX_CSS_KB || 500)
const MAX_RENDERER_SECONDARY_JS_KB = Number(process.env.MAX_RENDERER_SECONDARY_JS_KB || 3500)

function toKb(bytes) {
  return Number(bytes || 0) / 1000
}

function fmtKb(value) {
  return `${value.toFixed(2)} kB`
}

function pickLargestMatching(regex) {
  const names = fs.readdirSync(ASSETS_DIR)
    .filter((name) => regex.test(name))

  if (names.length === 0) return null

  let best = null
  for (const name of names) {
    const absolutePath = path.join(ASSETS_DIR, name)
    const stat = fs.statSync(absolutePath)
    const row = { name, bytes: Number(stat.size || 0), absolutePath }
    if (!best || row.bytes > best.bytes) best = row
  }
  return best
}

function listMatchingAssets(regex) {
  return fs.readdirSync(ASSETS_DIR)
    .filter((name) => regex.test(name))
    .map((name) => {
      const absolutePath = path.join(ASSETS_DIR, name)
      const stat = fs.statSync(absolutePath)
      return {
        name,
        bytes: Number(stat.size || 0),
        absolutePath,
      }
    })
}

function resolveAssetFromDistIndexHtml({ label, pattern, tagPattern }) {
  if (!fs.existsSync(DIST_INDEX_HTML)) {
    return null
  }

  const html = fs.readFileSync(DIST_INDEX_HTML, 'utf8')
  const tagMatch = html.match(tagPattern)
  const assetRef = tagMatch?.[1] || ''
  const normalizedRef = String(assetRef || '').trim()

  if (!normalizedRef || !pattern.test(path.basename(normalizedRef))) {
    return null
  }

  const absolutePath = path.resolve(DIST_DIR, normalizedRef)
  if (!fs.existsSync(absolutePath)) {
    return {
      label,
      missing: true,
      ref: normalizedRef,
    }
  }

  const stat = fs.statSync(absolutePath)
  return {
    name: path.basename(absolutePath),
    bytes: Number(stat.size || 0),
    absolutePath,
  }
}

if (!fs.existsSync(ASSETS_DIR)) {
  console.error('Bundle size check failed: dist/assets was not found. Run `npm run build:renderer` first.')
  process.exit(1)
}

const targets = [
  {
    label: 'renderer index bundle',
    match: /^index-.*\.js$/,
    budgetKb: MAX_RENDERER_INDEX_JS_KB,
    resolveCurrentAsset: () => resolveAssetFromDistIndexHtml({
      label: 'renderer index bundle',
      pattern: /^index-.*\.js$/,
      tagPattern: /<script[^>]+src="([^"]+index-[^"]+\.js)"/i,
    }),
  },
  {
    label: 'monaco ts worker',
    match: /^ts\.worker-.*\.js$/,
    budgetKb: MAX_MONACO_TS_WORKER_KB,
    optional: true,
  },
  {
    label: 'renderer index stylesheet',
    match: /^index-.*\.css$/,
    budgetKb: MAX_RENDERER_INDEX_CSS_KB,
    resolveCurrentAsset: () => resolveAssetFromDistIndexHtml({
      label: 'renderer index stylesheet',
      pattern: /^index-.*\.css$/,
      tagPattern: /<link[^>]+href="([^"]+index-[^"]+\.css)"/i,
    }),
  },
]

const violations = []
const resolvedAssetNames = new Set()
for (const target of targets) {
  const picked = target.resolveCurrentAsset?.() || pickLargestMatching(target.match)
  if (!picked) {
    if (target.optional) {
      console.log(`[bundle] ${target.label}: no standalone asset emitted`)
      continue
    }
    violations.push({
      label: target.label,
      message: `missing asset matching ${target.match}`,
    })
    continue
  }
  if (picked.missing) {
    violations.push({
      label: target.label,
      message: `current asset ${picked.ref} referenced by dist/index.html was not found`,
    })
    continue
  }
  resolvedAssetNames.add(String(picked.name || ''))
  const sizeKb = toKb(picked.bytes)
  if (sizeKb > target.budgetKb) {
    violations.push({
      label: target.label,
      message: `${picked.name} is ${fmtKb(sizeKb)} (budget ${fmtKb(target.budgetKb)})`,
    })
  } else {
    console.log(`[bundle] ${target.label}: ${picked.name} = ${fmtKb(sizeKb)} (budget ${fmtKb(target.budgetKb)})`)
  }
}

const secondaryJsAssets = listMatchingAssets(/^.*\.js$/)
  .filter((asset) => !resolvedAssetNames.has(asset.name))
  .filter((asset) => !/^index-.*\.js$/.test(asset.name))
  .filter((asset) => !/^ts\.worker-.*\.js$/.test(asset.name))
  .sort((left, right) => right.bytes - left.bytes || left.name.localeCompare(right.name))

for (const asset of secondaryJsAssets) {
  const sizeKb = toKb(asset.bytes)
  if (sizeKb > MAX_RENDERER_SECONDARY_JS_KB) {
    violations.push({
      label: 'secondary renderer chunk',
      message: `${asset.name} is ${fmtKb(sizeKb)} (budget ${fmtKb(MAX_RENDERER_SECONDARY_JS_KB)})`,
    })
    continue
  }
  console.log(`[bundle] secondary renderer chunk: ${asset.name} = ${fmtKb(sizeKb)} (budget ${fmtKb(MAX_RENDERER_SECONDARY_JS_KB)})`)
}

if (violations.length > 0) {
  console.error('Bundle size check failed:')
  for (const violation of violations) {
    console.error(`- ${violation.label}: ${violation.message}`)
  }
  process.exit(1)
}

console.log('Bundle size check passed.')
