import { pathToFileURL } from 'node:url'
import {
  installSkillFromGitHub,
  parseGitHubTreeUrl,
} from './github-skill-installer-lib.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

export function parseInstallSkillArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : []
  const options = {
    repo: '',
    ref: 'main',
    paths: [],
    dest: '',
    name: '',
    url: '',
  }
  for (let index = 0; index < args.length; index += 1) {
    const token = normalizeId(args[index])
    if (!token) continue
    if (token === '--repo' || token === '--ref' || token === '--path' || token === '--dest' || token === '--name' || token === '--url' || token === '--method') {
      const value = normalizeId(args[index + 1])
      if (!value) {
        throw new Error(`Missing value for ${token}.`)
      }
      if (token === '--repo') options.repo = value
      if (token === '--ref') options.ref = value
      if (token === '--path') options.paths.push(value)
      if (token === '--dest') options.dest = value
      if (token === '--name') options.name = value
      if (token === '--url') options.url = value
      index += 1
      continue
    }
    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }
    throw new Error(`Unknown argument: ${token}`)
  }
  if (options.url) {
    const parsed = parseGitHubTreeUrl(options.url)
    options.repo = parsed.repo
    options.ref = parsed.ref
    options.paths = [parsed.repoPath]
  }
  if (!options.repo) {
    throw new Error('GitHub repo is required. Use --repo owner/repo or --url https://github.com/owner/repo/tree/ref/path.')
  }
  if (options.paths.length === 0) {
    throw new Error('At least one --path value is required.')
  }
  if (options.name && options.paths.length !== 1) {
    throw new Error('--name can only be used when installing a single skill path.')
  }
  return options
}

export async function runInstallSkillCli(argv = process.argv.slice(2), {
  installSkillImpl = installSkillFromGitHub,
  stdout = process.stdout,
} = {}) {
  const options = parseInstallSkillArgs(argv)
  if (options.help) {
    stdout.write('Usage: node scripts/install-skill-from-github.mjs --repo owner/repo --path skills/.curated/frontend-skill [--ref main] [--dest /path/to/codex-home] [--name frontend-skill]\n')
    return []
  }
  const results = []
  for (const repoPath of options.paths) {
    const result = await installSkillImpl({
      repo: options.repo,
      repoPath,
      ref: options.ref,
      dest: options.dest,
      name: options.name,
    })
    results.push(result)
    stdout.write(`Installed ${result.skillName} from ${result.repo}/${result.repoPath} into ${result.destinationPath}\n`)
  }
  stdout.write('Restart ADDOM to pick up new skills.\n')
  return results
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  try {
    await runInstallSkillCli()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
