import fs from 'node:fs'
import path from 'node:path'

import { getUserDataPath } from '../platform/electron-app.mjs'
import { ensureManagedOpenAIAccountCodexHomeAssets } from '../openai-account/openai-account-codex-home-assets.mjs'
import {
  installSkillFromGitHub,
  listSkills,
  parseGitHubTreeUrl,
} from '../openai-account/codex-home-template/skills/.system/skill-installer/scripts/github-skill-installer-lib.mjs'

const OPENAI_LOCAL_SKILL_ROOT_DIR_NAME = 'openai-local'
const OPENAI_LOCAL_CODEX_HOME_DIR_NAME = 'codex-home'
const DEFAULT_SKILL_REPO = 'openai/skills'
const DEFAULT_SKILL_CHANNEL = 'curated'
const DEFAULT_SKILL_REF = 'main'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeId(value).toLowerCase()
}

function normalizeUserDataPath(options = {}) {
  const overridePath = normalizeId(options?.userDataPath)
  return path.resolve(overridePath || getUserDataPath())
}

export function resolveOpenAILocalSkillCodexHomePath(options = {}) {
  const userDataPath = normalizeUserDataPath(options)
  return path.join(userDataPath, OPENAI_LOCAL_SKILL_ROOT_DIR_NAME, OPENAI_LOCAL_CODEX_HOME_DIR_NAME)
}

function ensureOpenAILocalSkillCodexHome(options = {}) {
  const codexHomePath = resolveOpenAILocalSkillCodexHomePath(options)
  fs.mkdirSync(codexHomePath, { recursive: true })
  ensureManagedOpenAIAccountCodexHomeAssets(codexHomePath)
  return codexHomePath
}

function resolveSkillChannel(value = '') {
  return normalizeLower(value) === 'experimental' ? 'experimental' : DEFAULT_SKILL_CHANNEL
}

function resolveSkillRepoPath(channel = DEFAULT_SKILL_CHANNEL, skillName = '') {
  const normalizedChannel = resolveSkillChannel(channel)
  const safeSkillName = normalizeId(skillName)
  const basePath = normalizedChannel === 'experimental'
    ? 'skills/.experimental'
    : 'skills/.curated'
  return safeSkillName ? `${basePath}/${safeSkillName}` : basePath
}

function filterSkillEntries(skills = [], query = '') {
  const normalizedQuery = normalizeLower(query)
  const source = Array.isArray(skills) ? skills : []
  if (!normalizedQuery) return source
  return source.filter((entry) => normalizeLower(entry?.name).includes(normalizedQuery))
}

export async function listCuratedSkills(toolInput = {}, options = {}) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const channel = resolveSkillChannel(input.channel)
  const query = normalizeId(input.query)
  const codexHomePath = ensureOpenAILocalSkillCodexHome(options)
  const repoPath = resolveSkillRepoPath(channel)
  const skills = await listSkills({
    repo: DEFAULT_SKILL_REPO,
    repoPath,
    ref: DEFAULT_SKILL_REF,
    dest: codexHomePath,
    fetchJsonImpl: options?.skillFetchJsonImpl,
    gitRunnerImpl: options?.skillGitRunnerImpl,
  })
  const filteredSkills = filterSkillEntries(skills, query)
  const summary = query
    ? `Found ${filteredSkills.length} ${channel} skill${filteredSkills.length === 1 ? '' : 's'} matching "${query}".`
    : `Found ${filteredSkills.length} ${channel} skill${filteredSkills.length === 1 ? '' : 's'}.`
  return {
    ok: true,
    message: `${summary} Use install_curated_skill with the exact skill_name from this list instead of browsing the web or repo.`,
    summary,
    channel,
    query,
    repo: DEFAULT_SKILL_REPO,
    repoPath,
    ref: DEFAULT_SKILL_REF,
    localSkillHomePath: codexHomePath,
    skills: filteredSkills,
    total: filteredSkills.length,
  }
}

function resolveInstallTarget(input = {}) {
  const githubTreeUrl = normalizeId(input.github_tree_url)
  if (githubTreeUrl) {
    return parseGitHubTreeUrl(githubTreeUrl)
  }
  const skillName = normalizeId(input.skill_name)
  if (!skillName) {
    throw new Error('install_curated_skill requires skill_name or github_tree_url.')
  }
  return {
    repo: DEFAULT_SKILL_REPO,
    ref: DEFAULT_SKILL_REF,
    repoPath: resolveSkillRepoPath(resolveSkillChannel(input.channel), skillName),
  }
}

export async function installCuratedSkill(toolInput = {}, options = {}) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const codexHomePath = ensureOpenAILocalSkillCodexHome(options)
  const target = resolveInstallTarget(input)
  const installed = await installSkillFromGitHub({
    repo: target.repo,
    repoPath: target.repoPath,
    ref: target.ref || DEFAULT_SKILL_REF,
    dest: codexHomePath,
    name: normalizeId(input.install_as),
    fetchJsonImpl: options?.skillFetchJsonImpl,
    gitRunnerImpl: options?.skillGitRunnerImpl,
  })
  const message = `Installed curated skill "${installed.skillName}" to ${installed.destinationPath}. Restart ADDOM to pick up new skills.`
  return {
    ok: true,
    message,
    summary: message,
    restartRequired: true,
    skillName: installed.skillName,
    destinationPath: installed.destinationPath,
    repo: installed.repo,
    repoPath: installed.repoPath,
    ref: installed.ref,
    localSkillHomePath: codexHomePath,
  }
}
