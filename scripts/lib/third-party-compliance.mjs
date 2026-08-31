import fs from 'node:fs'
import path from 'node:path'

export const SCHEMA_VERSION = 1
export const LEGAL_DIR = path.join('build', 'legal')
export const MANUAL_ATTRIBUTIONS_PATH = path.join(LEGAL_DIR, 'manual-attributions.json')
export const OUTPUT_FILES = {
  fullInventory: path.join(LEGAL_DIR, 'full-dependency-inventory.json'),
  shippedInventory: path.join(LEGAL_DIR, 'shipped-third-party-inventory.json'),
  notices: path.join(LEGAL_DIR, 'THIRD_PARTY_NOTICES.txt'),
  credits: path.join(LEGAL_DIR, 'OSS_CREDITS.json'),
}

const LICENSE_FILE_NAMES = [
  'LICENSE',
  'LICENSE.txt',
  'LICENSE.md',
  'LICENCE',
  'LICENCE.txt',
  'LICENCE.md',
  'COPYING',
  'COPYING.txt',
  'COPYRIGHT',
]

const NOTICE_FILE_NAMES = [
  'NOTICE',
  'NOTICE.txt',
  'NOTICE.md',
  'ThirdPartyNoticeText.txt',
  'THIRD-PARTY-NOTICES.md',
]

const FORBIDDEN_LICENSE_PATTERNS = [
  /(^|[^a-z])agpl([^a-z]|$)/i,
  /(^|[^a-z])gpl([^a-z]|$)/i,
  /(^|[^a-z])lgpl([^a-z]|$)/i,
  /business source license|busl/i,
  /sspl/i,
  /commons clause/i,
  /elastic license/i,
  /polyform/i,
]

const REQUIRED_MANUAL_ITEMS = new Set([
  'vendored:phosphor',
  'vendored:models-dev',
  'vendored:geist-fonts',
  'vendored:inter-font',
  'vendored:jetbrains-mono-font',
  'bundled:electron-runtime',
  'bundled:chromium-notice-bundle',
])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function fileExists(filePath) {
  return fs.existsSync(filePath)
}

function normalizePath(value = '') {
  return String(value || '').split(path.sep).join('/')
}

function normalizeTextBlock(value = '') {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
}

function rel(root, absolutePath = '') {
  return normalizePath(path.relative(root, absolutePath))
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function asNonEmptyString(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

function compareStrings(a, b) {
  const left = String(a ?? '')
  const right = String(b ?? '')
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function stableSort(values = []) {
  return [...values].sort(compareStrings)
}

function findFirstExistingFile(rootDir, names = []) {
  for (const name of names) {
    const candidate = path.join(rootDir, name)
    if (fileExists(candidate)) return candidate
  }
  return ''
}

function collectNamedFilesRecursive(rootDir, names = []) {
  const wantedNames = new Set(
    ensureArray(names)
      .map((value) => asNonEmptyString(value))
      .filter(Boolean),
  )
  if (wantedNames.size === 0 || !fileExists(rootDir)) return []

  const hits = []
  const queue = [rootDir]

  while (queue.length > 0) {
    const currentDir = queue.shift()
    let entries = []
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      entries = []
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        queue.push(absolutePath)
        continue
      }
      if (wantedNames.has(entry.name)) hits.push(absolutePath)
    }
  }

  return stableSort(hits)
}

function pickRepositoryUrl(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    return asNonEmptyString(value.url || value.web || '')
  }
  return ''
}

function resolveSourceRef(name, metadata = {}, lockEntry = {}) {
  return (
    asNonEmptyString(metadata.repository)
    || asNonEmptyString(metadata.homepage)
    || asNonEmptyString(lockEntry.repository)
    || asNonEmptyString(lockEntry.homepage)
    || asNonEmptyString(lockEntry.resolved)
    || `https://www.npmjs.com/package/${encodeURIComponent(name)}`
  )
}

function normalizeLicense(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeLicense(entry)).filter(Boolean).join(' OR ')
  }
  if (value && typeof value === 'object') {
    return asNonEmptyString(value.type || value.name || '')
  }
  return String(value).trim()
}

function buildProdDevClassification(flags = []) {
  const hasProd = flags.includes('prod')
  const hasDev = flags.includes('dev')
  if (hasProd && hasDev) return 'mixed'
  if (hasProd) return 'prod'
  return 'dev'
}

function isForbiddenLicense(license = '') {
  const text = asNonEmptyString(license)
  if (!text) return false
  return FORBIDDEN_LICENSE_PATTERNS.some((pattern) => pattern.test(text))
}

function deriveNameFromLockPath(packagePath = '') {
  const normalized = normalizePath(packagePath)
  const marker = '/node_modules/'
  const index = normalized.lastIndexOf(marker)
  const tail = index >= 0 ? normalized.slice(index + marker.length) : normalized.replace(/^node_modules\//, '')
  if (tail.startsWith('@')) {
    const [scope, pkg] = tail.split('/')
    return pkg ? `${scope}/${pkg}` : tail
  }
  return tail.split('/')[0] || tail
}

function resolveDependencyPackagePath(packages, parentPackagePath = '', dependencyName = '') {
  const dep = asNonEmptyString(dependencyName)
  if (!dep) return ''
  const normalizedParent = normalizePath(parentPackagePath)

  if (!normalizedParent) {
    const rootCandidate = `node_modules/${dep}`
    return packages[rootCandidate] ? rootCandidate : ''
  }

  let cursor = normalizedParent
  while (cursor) {
    const nestedCandidate = `${cursor}/node_modules/${dep}`
    if (packages[nestedCandidate]) return nestedCandidate
    const marker = '/node_modules/'
    const index = cursor.lastIndexOf(marker)
    if (index < 0) break
    cursor = cursor.slice(0, index)
  }

  const rootCandidate = `node_modules/${dep}`
  return packages[rootCandidate] ? rootCandidate : ''
}

function collectRuntimeReachablePackagePaths(packages, runtimeDeps = new Set()) {
  const visited = new Set()
  const queue = []

  for (const dep of runtimeDeps) {
    const rootPath = resolveDependencyPackagePath(packages, '', dep)
    if (rootPath) queue.push(rootPath)
  }

  while (queue.length > 0) {
    const packagePath = queue.shift()
    if (!packagePath || visited.has(packagePath)) continue
    visited.add(packagePath)

    const lockEntry = packages[packagePath]
    const dependencies = lockEntry?.dependencies && typeof lockEntry.dependencies === 'object'
      ? Object.keys(lockEntry.dependencies)
      : []

    for (const dependencyName of dependencies) {
      const dependencyPath = resolveDependencyPackagePath(packages, packagePath, dependencyName)
      if (dependencyPath && !visited.has(dependencyPath)) queue.push(dependencyPath)
    }
  }

  return visited
}

function collectLockMetadata(name, lockEntry = {}) {
  return {
    license: normalizeLicense(lockEntry.license),
    repository: asNonEmptyString(lockEntry.repository),
    homepage: asNonEmptyString(lockEntry.homepage),
    sourceRef: resolveSourceRef(name, {
      repository: asNonEmptyString(lockEntry.repository),
      homepage: asNonEmptyString(lockEntry.homepage),
    }, lockEntry),
    licenseFile: '',
    noticeFile: '',
  }
}

function collectInstalledModuleMetadata(root, packagePath, lockEntry = {}) {
  const installPath = path.join(root, packagePath)
  let packageJson = {}
  const packageJsonPath = path.join(installPath, 'package.json')
  if (fileExists(packageJsonPath)) {
    try {
      packageJson = readJson(packageJsonPath)
    } catch {
      packageJson = {}
    }
  }

  const licenseFile = findFirstExistingFile(installPath, LICENSE_FILE_NAMES)
  const noticeFile = findFirstExistingFile(installPath, NOTICE_FILE_NAMES)

  return {
    installPath,
    license: normalizeLicense(lockEntry.license || packageJson.license),
    repository: pickRepositoryUrl(packageJson.repository),
    homepage: asNonEmptyString(packageJson.homepage),
    sourceRef: resolveSourceRef(lockEntry.name || deriveNameFromLockPath(packagePath), {
      repository: pickRepositoryUrl(packageJson.repository),
      homepage: asNonEmptyString(packageJson.homepage),
    }, lockEntry),
    licenseFile: licenseFile ? rel(root, licenseFile) : '',
    noticeFile: noticeFile ? rel(root, noticeFile) : '',
  }
}

function buildManualItem(root, manualItem = {}, installedVersions = new Map()) {
  const id = asNonEmptyString(manualItem.id)
  const detectedPaths = ensureArray(manualItem.detectPaths).map((entry) => asNonEmptyString(entry)).filter(Boolean)
  const detectedPathHits = detectedPaths.filter((entry) => fileExists(path.join(root, entry)))
  const shipped = manualItem.shipped === true || detectedPathHits.length > 0
  const versionSourcePackage = asNonEmptyString(manualItem.versionSourcePackage)
  const sourcedVersion = versionSourcePackage ? (installedVersions.get(versionSourcePackage) || '') : ''
  const version = asNonEmptyString(manualItem.version || sourcedVersion || manualItem.versionLabel || '')
  const licenseFile = asNonEmptyString(manualItem.licenseFile)
  const noticeFile = asNonEmptyString(manualItem.noticeFile)
  const sourceRef = (
    asNonEmptyString(manualItem.sourceRef)
    || asNonEmptyString(manualItem.repository)
    || asNonEmptyString(manualItem.homepage)
  )
  const detectedLicenseFiles = detectedPathHits.flatMap((entry) => collectNamedFilesRecursive(
    path.join(root, entry),
    manualItem.detectedLicenseFileNames,
  )).map((entry) => rel(root, entry))
  const detectedNoticeFiles = detectedPathHits.flatMap((entry) => collectNamedFilesRecursive(
    path.join(root, entry),
    manualItem.detectedNoticeFileNames,
  )).map((entry) => rel(root, entry))
  const licenseFiles = stableSort([
    ...new Set([
      ...ensureArray(manualItem.licenseFiles).map((entry) => asNonEmptyString(entry)).filter(Boolean),
      ...detectedLicenseFiles,
    ]),
  ])
  const noticeFiles = stableSort([
    ...new Set([
      ...ensureArray(manualItem.noticeFiles).map((entry) => asNonEmptyString(entry)).filter(Boolean),
      ...detectedNoticeFiles,
    ]),
  ])
  const sourcePaths = stableSort([
    ...new Set([
      ...ensureArray(manualItem.sourcePaths).map((entry) => asNonEmptyString(entry)).filter(Boolean),
      ...detectedPathHits,
    ]),
  ])

  return {
    id,
    name: asNonEmptyString(manualItem.name) || id,
    version,
    license: normalizeLicense(manualItem.license),
    repository: asNonEmptyString(manualItem.repository),
    homepage: asNonEmptyString(manualItem.homepage),
    sourceRef,
    directness: 'manual',
    prodDevClassification: shipped ? 'prod' : 'dev',
    classification: asNonEmptyString(manualItem.classification) || 'manual_review_required',
    shipped,
    sourceType: asNonEmptyString(manualItem.sourceType) || 'manual',
    sourcePaths,
    licenseFile,
    licenseFiles,
    noticeFile,
    noticeFiles,
    noticeReferences: ensureArray(manualItem.noticeReferences).map((entry) => ({
      path: asNonEmptyString(entry?.path),
      description: asNonEmptyString(entry?.description),
    })).filter((entry) => entry.path || entry.description),
    notes: asNonEmptyString(manualItem.notes),
    inlineNoticeText: asNonEmptyString(manualItem.inlineNoticeText),
    manualOverride: true,
    forbiddenLicense: isForbiddenLicense(manualItem.license),
  }
}

function aggregateInventory(root, pkg, lock, manual) {
  const runtimeDeps = new Set(Object.keys(pkg.dependencies || {}))
  const devDeps = new Set(Object.keys(pkg.devDependencies || {}))
  const packages = lock?.packages && typeof lock.packages === 'object' ? lock.packages : {}
  const runtimeReachablePaths = collectRuntimeReachablePackagePaths(packages, runtimeDeps)
  const installedVersions = new Map()
  const rowsByKey = new Map()

  for (const [packagePath, lockEntry] of Object.entries(packages)) {
    if (!packagePath) continue
    const name = asNonEmptyString(lockEntry?.name || deriveNameFromLockPath(packagePath))
    const version = asNonEmptyString(lockEntry?.version)
    if (!name || !version) continue

    if (!installedVersions.has(name)) installedVersions.set(name, version)

    const baseMetadata = collectLockMetadata(name, { ...lockEntry, name })
    const installedMetadata = runtimeReachablePaths.has(packagePath)
      ? collectInstalledModuleMetadata(root, packagePath, { ...lockEntry, name })
      : null
    const metadata = installedMetadata
      ? {
          ...baseMetadata,
          ...installedMetadata,
          license: installedMetadata.license || baseMetadata.license,
          repository: installedMetadata.repository || baseMetadata.repository,
          homepage: installedMetadata.homepage || baseMetadata.homepage,
          sourceRef: installedMetadata.sourceRef || baseMetadata.sourceRef,
          licenseFile: installedMetadata.licenseFile || baseMetadata.licenseFile,
          noticeFile: installedMetadata.noticeFile || baseMetadata.noticeFile,
        }
      : baseMetadata
    const key = `${name}@${version}`
    const current = rowsByKey.get(key) || {
      id: `npm:${key}`,
      name,
      version,
      license: '',
      repository: '',
      homepage: '',
      sourceRef: '',
      directness: 'transitive',
      prodDevFlags: [],
      classification: 'inventory_only',
      shipped: false,
      sourceType: 'npm',
      sourcePaths: [],
      licenseFiles: [],
      noticeFiles: [],
      manualOverride: false,
    }

    if (runtimeDeps.has(name) || devDeps.has(name)) current.directness = 'direct'
    current.prodDevFlags.push(runtimeReachablePaths.has(packagePath) ? 'prod' : 'dev')
    current.shipped = current.shipped || runtimeReachablePaths.has(packagePath)
    current.license = current.license || metadata.license
    current.repository = current.repository || metadata.repository
    current.homepage = current.homepage || metadata.homepage
    current.sourceRef = current.sourceRef || metadata.sourceRef
    if (metadata.licenseFile) current.licenseFiles.push(metadata.licenseFile)
    if (metadata.noticeFile) current.noticeFiles.push(metadata.noticeFile)
    current.sourcePaths.push(normalizePath(packagePath))
    rowsByKey.set(key, current)
  }

  const packageRows = [...rowsByKey.values()]
    .map((row) => {
      const license = asNonEmptyString(row.license)
      const classification = row.shipped
        ? (license ? 'shipped_runtime' : 'manual_review_required')
        : 'inventory_only'
      return {
        id: row.id,
        name: row.name,
        version: row.version,
        license,
        repository: row.repository,
        homepage: row.homepage,
        sourceRef: row.sourceRef,
        directness: row.directness,
        prodDevClassification: buildProdDevClassification(row.prodDevFlags),
        classification,
        shipped: row.shipped,
        sourceType: row.sourceType,
        sourcePaths: stableSort(row.sourcePaths),
        licenseFiles: stableSort([...new Set(row.licenseFiles)]),
        noticeFiles: stableSort([...new Set(row.noticeFiles)]),
        manualOverride: false,
        forbiddenLicense: isForbiddenLicense(license),
      }
    })

  const manualRows = ensureArray(manual?.items).map((item) => buildManualItem(root, item, installedVersions))

  const fullInventory = [...packageRows, ...manualRows]
    .sort((a, b) => compareStrings(`${a.name}@${a.version}`, `${b.name}@${b.version}`))

  const shippedInventory = fullInventory
    .filter((row) => row.shipped === true)
    .sort((a, b) => compareStrings(`${a.name}@${a.version}`, `${b.name}@${b.version}`))

  return { fullInventory, shippedInventory, installedVersions }
}

function readTextBlock(root, relativePath = '') {
  const normalized = asNonEmptyString(relativePath)
  if (!normalized) return ''
  const absolutePath = path.join(root, normalized)
  if (!fileExists(absolutePath)) return ''
  return normalizeTextBlock(fs.readFileSync(absolutePath, 'utf8'))
}

function buildNoticesText(root, shippedInventory = []) {
  const lines = [
    'ADDOM Third-Party Notices',
    '',
    'This bundle covers the third-party software, vendored assets, and bundled runtimes redistributed with ADDOM builds.',
    'Preserve these notices together with packaged outputs for commercial distribution.',
    '',
  ]

  for (const row of shippedInventory) {
    const licenseFilePaths = stableSort([
      ...new Set([
        ...ensureArray(row.licenseFiles).map((entry) => asNonEmptyString(entry)).filter(Boolean),
        asNonEmptyString(row.licenseFile),
      ].filter(Boolean)),
    ])
    const noticeFilePaths = stableSort([
      ...new Set([
        ...ensureArray(row.noticeFiles).map((entry) => asNonEmptyString(entry)).filter(Boolean),
        asNonEmptyString(row.noticeFile),
      ].filter(Boolean)),
    ])

    lines.push(`=== ${row.id} ===`)
    lines.push(`Name: ${row.name}`)
    if (row.version) lines.push(`Version: ${row.version}`)
    lines.push(`Classification: ${row.classification}`)
    lines.push(`License: ${row.license || 'UNSPECIFIED'}`)
    if (row.sourceRef) lines.push(`Source: ${row.sourceRef}`)
    if (row.repository) lines.push(`Repository: ${row.repository}`)
    if (row.homepage) lines.push(`Homepage: ${row.homepage}`)
    if (Array.isArray(row.sourcePaths) && row.sourcePaths.length > 0) {
      lines.push(`Shipped paths: ${row.sourcePaths.join(', ')}`)
    }
    if (row.notes) lines.push(`Notes: ${row.notes}`)
    if (Array.isArray(row.noticeReferences) && row.noticeReferences.length > 0) {
      for (const ref of row.noticeReferences) {
        lines.push(`Notice reference: ${ref.path}${ref.description ? ` (${ref.description})` : ''}`)
      }
    }
    if (licenseFilePaths.length > 1) {
      lines.push(`License files: ${licenseFilePaths.join(', ')}`)
    } else if (licenseFilePaths.length === 1) {
      lines.push(`License file: ${licenseFilePaths[0]}`)
    }
    if (noticeFilePaths.length > 1) {
      lines.push(`Notice files: ${noticeFilePaths.join(', ')}`)
    } else if (noticeFilePaths.length === 1) {
      lines.push(`Notice file: ${noticeFilePaths[0]}`)
    }

    const noticeTexts = []
    const licenseTexts = []
    for (const noticeFile of noticeFilePaths) {
      const text = readTextBlock(root, noticeFile)
      if (text) noticeTexts.push({ file: noticeFile, text })
    }
    for (const licenseFile of licenseFilePaths) {
      const text = readTextBlock(root, licenseFile)
      if (text) licenseTexts.push({ file: licenseFile, text })
    }

    if (row.inlineNoticeText) {
      lines.push('')
      lines.push('NOTICE')
      lines.push(row.inlineNoticeText)
    }

    for (const block of noticeTexts) {
      lines.push('')
      lines.push(`NOTICE (${block.file})`)
      lines.push(block.text)
    }

    for (const block of licenseTexts) {
      lines.push('')
      lines.push(`LICENSE (${block.file})`)
      lines.push(block.text)
    }

    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

function buildCredits(shippedInventory = []) {
  return {
    schemaVersion: SCHEMA_VERSION,
    surfaces: ['win', 'mac', 'linux', 'installer', 'dir'],
    documents: {
      thirdPartyNotices: 'legal/THIRD_PARTY_NOTICES.txt',
      shippedInventory: 'legal/shipped-third-party-inventory.json',
    },
    items: shippedInventory.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      license: row.license,
      classification: row.classification,
      sourceRef: row.sourceRef,
    })),
  }
}

function buildJsonOutputs(fullInventory = [], shippedInventory = []) {
  return {
    fullInventory: {
      schemaVersion: SCHEMA_VERSION,
      inventoryType: 'full',
      itemCount: fullInventory.length,
      items: fullInventory,
    },
    shippedInventory: {
      schemaVersion: SCHEMA_VERSION,
      inventoryType: 'shipped',
      distributionSurfaces: ['win', 'mac', 'linux', 'installer', 'dir'],
      itemCount: shippedInventory.length,
      items: shippedInventory,
    },
  }
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function buildComplianceArtifacts(root = process.cwd()) {
  const packageJson = readJson(path.join(root, 'package.json'))
  const packageLock = readJson(path.join(root, 'package-lock.json'))
  const manual = readJson(path.join(root, MANUAL_ATTRIBUTIONS_PATH))
  const { fullInventory, shippedInventory } = aggregateInventory(root, packageJson, packageLock, manual)

  const outputs = buildJsonOutputs(fullInventory, shippedInventory)
  const noticesText = buildNoticesText(root, shippedInventory)
  const credits = buildCredits(shippedInventory)

  return {
    manual,
    fullInventory,
    shippedInventory,
    outputContents: {
      [OUTPUT_FILES.fullInventory]: stringifyJson(outputs.fullInventory),
      [OUTPUT_FILES.shippedInventory]: stringifyJson(outputs.shippedInventory),
      [OUTPUT_FILES.notices]: noticesText,
      [OUTPUT_FILES.credits]: stringifyJson(credits),
    },
  }
}

export function writeComplianceArtifacts(root = process.cwd()) {
  const artifacts = buildComplianceArtifacts(root)
  const legalDir = path.join(root, LEGAL_DIR)
  fs.mkdirSync(legalDir, { recursive: true })
  for (const [relativePath, content] of Object.entries(artifacts.outputContents)) {
    fs.writeFileSync(path.join(root, relativePath), content, 'utf8')
  }
  return artifacts
}

export function validateComplianceArtifacts(root = process.cwd()) {
  const artifacts = buildComplianceArtifacts(root)
  const failures = []
  const manualIds = new Set(ensureArray(artifacts.manual?.items).map((item) => asNonEmptyString(item?.id)).filter(Boolean))
  for (const requiredId of REQUIRED_MANUAL_ITEMS) {
    if (!manualIds.has(requiredId)) failures.push(`Missing required manual attribution entry: ${requiredId}`)
  }

  for (const [relativePath, expectedContent] of Object.entries(artifacts.outputContents)) {
    const absolutePath = path.join(root, relativePath)
    if (!fileExists(absolutePath)) {
      failures.push(`Missing generated compliance file: ${relativePath}`)
      continue
    }
    const currentContent = fs.readFileSync(absolutePath, 'utf8')
    if (currentContent !== expectedContent) {
      failures.push(`Generated compliance file is stale: ${relativePath}`)
    }
  }

  for (const row of artifacts.shippedInventory) {
    if (!row.manualOverride && !row.license) {
      failures.push(`Shipped item is missing a resolved license: ${row.id}`)
    }
    if (row.classification === 'manual_review_required') {
      failures.push(`Shipped item still requires manual review: ${row.id}`)
    }
    if (!row.sourceRef && !row.repository && !row.homepage && !row.manualOverride) {
      failures.push(`Shipped item is missing a source reference: ${row.id}`)
    }
    if (row.forbiddenLicense && row.manualOverride !== true) {
      failures.push(`Forbidden license detected in shipped item without override: ${row.id} (${row.license})`)
    }
    if (
      ((Array.isArray(row.noticeFiles) && row.noticeFiles.length > 0) || row.noticeFile || row.inlineNoticeText)
      && !artifacts.outputContents[OUTPUT_FILES.notices].includes(`=== ${row.id} ===`)
    ) {
      failures.push(`THIRD_PARTY_NOTICES.txt does not include shipped notice section: ${row.id}`)
    }
  }

  const vendoredPhosphor = artifacts.shippedInventory.find((row) => row.id === 'vendored:phosphor')
  if (!vendoredPhosphor) {
    failures.push('Vendored Phosphor assets are missing from shipped inventory.')
  }

  return {
    artifacts,
    failures,
  }
}
