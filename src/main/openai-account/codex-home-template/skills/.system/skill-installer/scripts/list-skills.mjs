import { pathToFileURL } from 'node:url'
import { listSkills } from './github-skill-installer-lib.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

export function parseListSkillsArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : []
  const options = {
    repo: 'openai/skills',
    path: 'skills/.curated',
    ref: 'main',
    dest: '',
    format: 'text',
  }
  for (let index = 0; index < args.length; index += 1) {
    const token = normalizeId(args[index])
    if (!token) continue
    if (token === '--repo' || token === '--path' || token === '--ref' || token === '--dest' || token === '--format') {
      const value = normalizeId(args[index + 1])
      if (!value) {
        throw new Error(`Missing value for ${token}.`)
      }
      if (token === '--repo') options.repo = value
      if (token === '--path') options.path = value
      if (token === '--ref') options.ref = value
      if (token === '--dest') options.dest = value
      if (token === '--format') options.format = value.toLowerCase()
      index += 1
      continue
    }
    if (token === '--help' || token === '-h') {
      options.help = true
      continue
    }
    throw new Error(`Unknown argument: ${token}`)
  }
  if (options.format !== 'text' && options.format !== 'json') {
    throw new Error(`Unsupported format "${options.format}". Use text or json.`)
  }
  return options
}

function formatListText(skills = []) {
  return skills
    .map((entry, index) => `${index + 1}. ${entry.name}${entry.installed ? ' (already installed)' : ''}`)
    .join('\n')
}

export async function runListSkillsCli(argv = process.argv.slice(2), {
  listSkillsImpl = listSkills,
  stdout = process.stdout,
} = {}) {
  const options = parseListSkillsArgs(argv)
  if (options.help) {
    stdout.write('Usage: node scripts/list-skills.mjs [--repo owner/repo] [--path skills/.curated] [--ref main] [--dest /path/to/codex-home] [--format text|json]\n')
    return []
  }
  const skills = await listSkillsImpl({
    repo: options.repo,
    repoPath: options.path,
    ref: options.ref,
    dest: options.dest,
  })
  if (options.format === 'json') {
    stdout.write(`${JSON.stringify(skills, null, 2)}\n`)
    return skills
  }
  stdout.write(`Skills from ${options.repo}/${options.path}:\n`)
  stdout.write(`${formatListText(skills)}\n`)
  return skills
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  try {
    await runListSkillsCli()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
