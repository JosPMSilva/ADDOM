import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TEMPLATE_ROOT_PATH = fileURLToPath(new URL('./codex-home-template/', import.meta.url))
const MANAGED_SKILL_INSTALLER_RELATIVE_PATH = path.join('skills', '.system', 'skill-installer')

function normalizeId(value = '') {
  return String(value || '').trim()
}

function copyDirectoryRecursive(sourcePath = '', targetPath = '') {
  fs.mkdirSync(targetPath, { recursive: true })
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const nextSourcePath = path.join(sourcePath, entry.name)
    const nextTargetPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryRecursive(nextSourcePath, nextTargetPath)
      continue
    }
    fs.mkdirSync(path.dirname(nextTargetPath), { recursive: true })
    fs.copyFileSync(nextSourcePath, nextTargetPath)
  }
}

export function resolveManagedOpenAIAccountCodexHomeAssetPaths(codexHomePath = '') {
  const safeCodexHomePath = normalizeId(codexHomePath)
  if (!safeCodexHomePath) {
    throw new Error('OpenAI account Codex home path is required.')
  }
  return {
    templateRootPath: TEMPLATE_ROOT_PATH,
    sourceSkillInstallerPath: path.join(TEMPLATE_ROOT_PATH, MANAGED_SKILL_INSTALLER_RELATIVE_PATH),
    targetSkillInstallerPath: path.join(path.resolve(safeCodexHomePath), MANAGED_SKILL_INSTALLER_RELATIVE_PATH),
  }
}

export function ensureManagedOpenAIAccountCodexHomeAssets(codexHomePath = '') {
  const paths = resolveManagedOpenAIAccountCodexHomeAssetPaths(codexHomePath)
  if (!fs.existsSync(paths.sourceSkillInstallerPath)) {
    throw new Error(`Managed OpenAI account skill installer template is missing at ${paths.sourceSkillInstallerPath}.`)
  }
  try {
    fs.rmSync(paths.targetSkillInstallerPath, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup only.
  }
  copyDirectoryRecursive(paths.sourceSkillInstallerPath, paths.targetSkillInstallerPath)
  return paths
}

export const __testOpenAIAccountCodexHomeAssetsInternals = Object.freeze({
  TEMPLATE_ROOT_PATH,
  MANAGED_SKILL_INSTALLER_RELATIVE_PATH,
  copyDirectoryRecursive,
})
