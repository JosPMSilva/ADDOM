import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function encodeGitHubPathSegments(repoPath = '') {
  return normalizeId(repoPath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildGitHubHeaders({ accept = 'application/vnd.github+json' } = {}) {
  const headers = {
    Accept: normalizeId(accept) || 'application/vnd.github+json',
    'User-Agent': 'ADDOM-Skill-Installer',
  }
  const token = normalizeId(process.env.GITHUB_TOKEN || process.env.GH_TOKEN)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function requestJson(url = '', { headers = null, redirectsRemaining = 5 } = {}) {
  const safeUrl = normalizeId(url)
  if (!safeUrl) {
    return Promise.reject(new Error('GitHub API URL is required.'))
  }
  const safeHeaders = headers && typeof headers === 'object' ? { ...headers } : buildGitHubHeaders()
  return new Promise((resolve, reject) => {
    const request = https.request(safeUrl, {
      method: 'GET',
      headers: safeHeaders,
    }, (response) => {
      const statusCode = Number(response.statusCode || 0)
      const location = normalizeId(response.headers.location)
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume()
        if (redirectsRemaining <= 0) {
          reject(new Error(`Too many redirects fetching ${safeUrl}.`))
          return
        }
        resolve(requestJson(location, {
          headers: safeHeaders,
          redirectsRemaining: redirectsRemaining - 1,
        }))
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        let errorBody = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          errorBody += String(chunk || '')
        })
        response.once('end', () => {
          let detail = ''
          try {
            detail = normalizeId(JSON.parse(errorBody)?.message)
          } catch {
            detail = normalizeId(errorBody)
          }
          reject(new Error(detail ? `GitHub API request failed (${statusCode}): ${detail}` : `GitHub API request failed with status ${statusCode}.`))
        })
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += String(chunk || '')
      })
      response.once('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch {
          reject(new Error(`GitHub API returned invalid JSON for ${safeUrl}.`))
        }
      })
    })
    request.once('error', reject)
    request.end()
  })
}

function isGitHubRateLimitError(error) {
  const message = normalizeId(error instanceof Error ? error.message : error)
  return /GitHub API request failed \(403\): .*rate limit exceeded/i.test(message)
}

function isGitHubBadCredentialsError(error) {
  const message = normalizeId(error instanceof Error ? error.message : error)
  return /GitHub API request failed \(401\): .*bad credentials/i.test(message)
}

function isGitHubFallbackEligibleError(error) {
  return isGitHubRateLimitError(error) || isGitHubBadCredentialsError(error)
}

function describeGitHubFallbackReason(error) {
  if (isGitHubRateLimitError(error)) return 'GitHub API rate limit exceeded'
  if (isGitHubBadCredentialsError(error)) return 'GitHub API credentials were rejected'
  return 'GitHub API request failed'
}

function runGitCommand({
  args = [],
  cwd = '',
} = {}) {
  const result = spawnSync('git', args, {
    cwd: normalizeId(cwd) || undefined,
    encoding: 'utf8',
  })
  const stdout = normalizeId(result.stdout)
  const stderr = normalizeId(result.stderr)
  if (result.error) {
    throw new Error(`Git fallback is unavailable: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = stderr || stdout || `exit code ${String(result.status)}`
    throw new Error(`Git fallback failed: ${detail}`)
  }
  return { stdout, stderr }
}

function buildGitCloneUrl(repo = '') {
  const safeRepo = normalizeId(repo)
  if (!safeRepo) {
    throw new Error('GitHub repo is required.')
  }
  return `https://github.com/${safeRepo}.git`
}

function resolveRepoFilesystemPath(rootPath = '', repoPath = '') {
  const safeRootPath = normalizeId(rootPath)
  const safeRepoPath = normalizeId(repoPath)
  if (!safeRootPath || !safeRepoPath) {
    throw new Error('Repository checkout path and repo path are required.')
  }
  return path.join(safeRootPath, ...safeRepoPath.split('/').filter(Boolean))
}

function listInstalledSkillNames(installedSkillsPath = '') {
  if (!installedSkillsPath || !fs.existsSync(installedSkillsPath)) {
    return new Set()
  }
  return new Set(
    fs.readdirSync(installedSkillsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )
}

async function withGitSparseCheckout({
  repo = '',
  ref = 'main',
  repoPaths = [],
  gitRunnerImpl = runGitCommand,
  callback = null,
} = {}) {
  const safeRef = normalizeId(ref) || 'main'
  const safeRepoPaths = (Array.isArray(repoPaths) ? repoPaths : [repoPaths])
    .map((entry) => normalizeId(entry))
    .filter(Boolean)
  if (safeRepoPaths.length === 0) {
    throw new Error('At least one repo path is required for git fallback.')
  }
  if (typeof callback !== 'function') {
    throw new Error('Git fallback callback is required.')
  }
  const tempRootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-skill-installer-'))
  const checkoutPath = path.join(tempRootPath, 'repo')
  try {
    await gitRunnerImpl({
      args: ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', safeRef, buildGitCloneUrl(repo), checkoutPath],
    })
    await gitRunnerImpl({
      args: ['-C', checkoutPath, 'sparse-checkout', 'set', '--no-cone', ...safeRepoPaths],
    })
    return await callback(checkoutPath)
  } finally {
    try {
      fs.rmSync(tempRootPath, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}

export function resolveCodexHomePath({ dest = '', moduleUrl = import.meta.url } = {}) {
  const explicitPath = normalizeId(dest)
  if (explicitPath) return path.resolve(explicitPath)
  const envPath = normalizeId(process.env.CODEX_HOME)
  if (envPath) return path.resolve(envPath)
  const inferredPath = inferManagedCodexHomeFromModuleUrl(moduleUrl)
  if (inferredPath) return inferredPath
  return path.join(os.homedir(), '.codex')
}

export function inferManagedCodexHomeFromModuleUrl(moduleUrl = import.meta.url) {
  const safeModuleUrl = normalizeId(moduleUrl)
  if (!safeModuleUrl) return ''
  let modulePath = ''
  try {
    modulePath = fileURLToPath(safeModuleUrl)
  } catch {
    return ''
  }
  const scriptsDirPath = path.dirname(modulePath)
  const candidateCodexHomePath = path.resolve(scriptsDirPath, '..', '..', '..', '..')
  if (normalizeId(path.basename(candidateCodexHomePath)).toLowerCase() !== 'codex-home') {
    return ''
  }
  const expectedInstallerPath = path.join(candidateCodexHomePath, 'skills', '.system', 'skill-installer')
  if (!fs.existsSync(expectedInstallerPath) || !fs.statSync(expectedInstallerPath).isDirectory()) {
    return ''
  }
  return candidateCodexHomePath
}

export function resolveCodexSkillsPath({ dest = '' } = {}) {
  return path.join(resolveCodexHomePath({ dest }), 'skills')
}

export function buildGitHubContentsApiUrl({
  repo = '',
  repoPath = '',
  ref = 'main',
} = {}) {
  const safeRepo = normalizeId(repo)
  const safeRef = normalizeId(ref) || 'main'
  if (!safeRepo) {
    throw new Error('GitHub repo is required.')
  }
  const encodedPath = encodeGitHubPathSegments(repoPath)
  const baseUrl = `https://api.github.com/repos/${safeRepo}/contents`
  const targetUrl = encodedPath ? `${baseUrl}/${encodedPath}` : baseUrl
  return `${targetUrl}?ref=${encodeURIComponent(safeRef)}`
}

export function parseGitHubTreeUrl(url = '') {
  const safeUrl = normalizeId(url)
  if (!safeUrl) throw new Error('GitHub URL is required.')
  let parsed
  try {
    parsed = new URL(safeUrl)
  } catch {
    throw new Error(`Invalid GitHub URL: ${safeUrl}`)
  }
  if (!/^(www\.)?github\.com$/i.test(parsed.hostname)) {
    throw new Error(`Unsupported GitHub host: ${parsed.hostname}`)
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 5) {
    throw new Error(`Unsupported GitHub URL format: ${safeUrl}`)
  }
  const [owner, repo, mode, ref, ...repoPathParts] = segments
  if (!owner || !repo || (mode !== 'tree' && mode !== 'blob') || !ref || repoPathParts.length === 0) {
    throw new Error(`Unsupported GitHub URL format: ${safeUrl}`)
  }
  return {
    repo: `${owner}/${repo}`,
    ref,
    repoPath: repoPathParts.join('/'),
  }
}

function normalizeSkillDirectoryName(name = '') {
  const safeName = normalizeId(name)
  if (!safeName) {
    throw new Error('Skill name is required.')
  }
  if (safeName.includes('/') || safeName.includes('\\')) {
    throw new Error(`Skill name must be a single directory name: ${safeName}`)
  }
  return safeName
}

async function fetchRepoEntry({
  repo = '',
  repoPath = '',
  ref = 'main',
  fetchJsonImpl = requestJson,
} = {}) {
  return await fetchJsonImpl(buildGitHubContentsApiUrl({ repo, repoPath, ref }), {
    headers: buildGitHubHeaders(),
  })
}

function decodeGitHubFileContent(entry = null) {
  const source = entry && typeof entry === 'object' ? entry : {}
  const content = normalizeId(source.content)
  const encoding = normalizeId(source.encoding).toLowerCase()
  if (!content || encoding !== 'base64') {
    throw new Error(`Unsupported GitHub file encoding for ${normalizeId(source.path) || 'unknown file'}.`)
  }
  return Buffer.from(content.replace(/\n/g, ''), 'base64')
}

async function writeRepoTree({
  repo = '',
  repoPath = '',
  ref = 'main',
  destinationPath = '',
  fetchJsonImpl = requestJson,
} = {}) {
  const entry = await fetchRepoEntry({ repo, repoPath, ref, fetchJsonImpl })
  if (Array.isArray(entry)) {
    fs.mkdirSync(destinationPath, { recursive: true })
    for (const child of entry) {
      const childName = normalizeId(child?.name)
      const childPath = normalizeId(child?.path)
      const childType = normalizeId(child?.type)
      if (!childName || !childPath) continue
      const nextDestinationPath = path.join(destinationPath, childName)
      if (childType === 'dir' || childType === 'file') {
        await writeRepoTree({
          repo,
          repoPath: childPath,
          ref,
          destinationPath: nextDestinationPath,
          fetchJsonImpl,
        })
        continue
      }
      throw new Error(`Unsupported GitHub content type "${childType}" for ${childPath}.`)
    }
    return
  }
  if (!entry || typeof entry !== 'object') {
    throw new Error(`GitHub path did not resolve to a directory or file: ${repoPath}`)
  }
  if (entry.type !== 'file') {
    throw new Error(`Unsupported GitHub content type "${normalizeId(entry.type)}" for ${repoPath}.`)
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  fs.writeFileSync(destinationPath, decodeGitHubFileContent(entry))
}

export async function installSkillFromGitHub({
  repo = '',
  repoPath = '',
  ref = 'main',
  dest = '',
  name = '',
  fetchJsonImpl = requestJson,
  gitRunnerImpl = runGitCommand,
} = {}) {
  const safeRepoPath = normalizeId(repoPath)
  if (!safeRepoPath) {
    throw new Error('GitHub skill path is required.')
  }
  const skillName = normalizeSkillDirectoryName(name || path.posix.basename(safeRepoPath))
  const skillsRootPath = resolveCodexSkillsPath({ dest })
  const destinationPath = path.join(skillsRootPath, skillName)
  if (fs.existsSync(destinationPath)) {
    throw new Error(`Skill "${skillName}" is already installed at ${destinationPath}.`)
  }
  try {
    const sourceEntry = await fetchRepoEntry({ repo, repoPath: safeRepoPath, ref, fetchJsonImpl })
    if (!Array.isArray(sourceEntry)) {
      throw new Error(`GitHub skill path must resolve to a directory: ${safeRepoPath}`)
    }
    fs.mkdirSync(skillsRootPath, { recursive: true })
    for (const child of sourceEntry) {
      const childName = normalizeId(child?.name)
      const childPath = normalizeId(child?.path)
      const childType = normalizeId(child?.type)
      if (!childName || !childPath) continue
      if (childType === 'dir' || childType === 'file') {
        await writeRepoTree({
          repo,
          repoPath: childPath,
          ref,
          destinationPath: path.join(destinationPath, childName),
          fetchJsonImpl,
        })
        continue
      }
      throw new Error(`Unsupported GitHub content type "${childType}" for ${childPath}.`)
    }
  } catch (error) {
    if (!isGitHubFallbackEligibleError(error)) {
      throw error
    }
    try {
      await withGitSparseCheckout({
        repo,
        ref,
        repoPaths: [safeRepoPath],
        gitRunnerImpl,
        callback: async (checkoutPath) => {
          const sourcePath = resolveRepoFilesystemPath(checkoutPath, safeRepoPath)
          if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
            throw new Error(`GitHub skill path must resolve to a directory: ${safeRepoPath}`)
          }
          fs.mkdirSync(skillsRootPath, { recursive: true })
          fs.cpSync(sourcePath, destinationPath, {
            recursive: true,
            force: false,
            errorOnExist: true,
          })
        },
      })
    } catch (fallbackError) {
      throw new Error(`${describeGitHubFallbackReason(error)} and git fallback failed: ${normalizeId(fallbackError instanceof Error ? fallbackError.message : fallbackError)}`)
    }
  }
  return {
    skillName,
    destinationPath,
    repo: normalizeId(repo),
    repoPath: safeRepoPath,
    ref: normalizeId(ref) || 'main',
  }
}

export async function listSkills({
  repo = 'openai/skills',
  repoPath = 'skills/.curated',
  ref = 'main',
  dest = '',
  fetchJsonImpl = requestJson,
  gitRunnerImpl = runGitCommand,
} = {}) {
  const installedSkillsPath = resolveCodexSkillsPath({ dest })
  const installedNames = listInstalledSkillNames(installedSkillsPath)
  try {
    const listing = await fetchRepoEntry({ repo, repoPath, ref, fetchJsonImpl })
    if (!Array.isArray(listing)) {
      throw new Error(`GitHub directory listing failed for ${repoPath}.`)
    }
    return listing
      .filter((entry) => normalizeId(entry?.type) === 'dir' && normalizeId(entry?.name))
      .map((entry) => ({
        name: normalizeId(entry.name),
        installed: installedNames.has(normalizeId(entry.name)),
        repoPath: normalizeId(entry.path),
        repo: normalizeId(repo),
        ref: normalizeId(ref) || 'main',
      }))
  } catch (error) {
    if (!isGitHubFallbackEligibleError(error)) {
      throw error
    }
    try {
      return await withGitSparseCheckout({
        repo,
        ref,
        repoPaths: [repoPath],
        gitRunnerImpl,
        callback: async (checkoutPath) => {
          const listingRootPath = resolveRepoFilesystemPath(checkoutPath, repoPath)
          if (!fs.existsSync(listingRootPath) || !fs.statSync(listingRootPath).isDirectory()) {
            throw new Error(`GitHub directory listing failed for ${repoPath}.`)
          }
          return fs.readdirSync(listingRootPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && normalizeId(entry.name))
            .map((entry) => ({
              name: normalizeId(entry.name),
              installed: installedNames.has(normalizeId(entry.name)),
              repoPath: `${normalizeId(repoPath)}/${normalizeId(entry.name)}`,
              repo: normalizeId(repo),
              ref: normalizeId(ref) || 'main',
            }))
        },
      })
    } catch (fallbackError) {
      throw new Error(`${describeGitHubFallbackReason(error)} and git fallback failed: ${normalizeId(fallbackError instanceof Error ? fallbackError.message : fallbackError)}`)
    }
  }
}
