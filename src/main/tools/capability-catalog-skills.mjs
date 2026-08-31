import { assertValidCapabilityCatalogEntry } from './capability-catalog-schema.mjs'
import {
  buildCapabilityCatalogPages,
  buildCapabilityCatalogPath,
  assertCapabilityCatalogPageCaps,
} from './capability-catalog-builder.mjs'
import { sanitizeCatalogText } from './capability-catalog-sanitize.mjs'
import { listAllSkills } from '../moa/skill-registry.mjs'

const MAX_SKILL_CATEGORIES = 16
const MAX_SKILLS_PER_CATEGORY = 24

function titleCase(value = '') {
  return String(value || '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function normalizeSkillSummary(skill = {}) {
  const id = sanitizeCatalogText(skill.id || '', { maxChars: 120, singleLine: true })
  if (!id) return null
  return {
    id,
    label: sanitizeCatalogText(skill.label || id, { maxChars: 140, singleLine: true }),
    description: sanitizeCatalogText(skill.description || '', { maxChars: 240, singleLine: true }),
    category: sanitizeCatalogText(skill.category || 'general', { maxChars: 80, singleLine: true }).toLowerCase(),
    tags: Array.isArray(skill.tags)
      ? skill.tags.map((tag) => sanitizeCatalogText(tag, { maxChars: 40, singleLine: true })).filter(Boolean).slice(0, 8)
      : [],
    recommendedUseCases: Array.isArray(skill.recommendedUseCases)
      ? skill.recommendedUseCases
        .map((item) => sanitizeCatalogText(item, { maxChars: 160, singleLine: true }))
        .filter(Boolean)
        .slice(0, 4)
      : [],
    suggestedCanWriteFiles: skill.suggestedCanWriteFiles === true,
    source: sanitizeCatalogText(skill.source || 'unknown', { maxChars: 120, singleLine: true }),
  }
}

function groupSkillsByCategory(skills = []) {
  const grouped = new Map()
  for (const rawSkill of Array.isArray(skills) ? skills : []) {
    const skill = normalizeSkillSummary(rawSkill)
    if (!skill) continue
    const category = skill.category || 'general'
    const current = grouped.get(category) || []
    current.push(skill)
    grouped.set(category, current)
  }
  return [...grouped.entries()]
    .map(([category, entries]) => [
      category,
      [...entries].sort((a, b) => {
        const aExternal = String(a.source || '').startsWith('addom/') ? 1 : 0
        const bExternal = String(b.source || '').startsWith('addom/') ? 1 : 0
        if (aExternal !== bExternal) return aExternal - bExternal
        return a.id.localeCompare(b.id)
      }),
    ])
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_SKILL_CATEGORIES)
}

function buildSkillToolSummaries(skills = []) {
  return skills.slice(0, MAX_SKILLS_PER_CATEGORY).map((skill) => ({
    name: skill.id,
    defaultExposure: 'catalog_only',
    riskClass: skill.suggestedCanWriteFiles ? 'medium' : 'low',
    summary: `${skill.label}: ${skill.description || 'Registry skill summary.'}`,
  }))
}

function resolveTrust(skills = []) {
  return skills.every((skill) => String(skill.source || '').startsWith('addom/'))
    ? 'curated'
    : 'external'
}

function buildCategoryEntry(category = 'general', skills = []) {
  const visibleSkills = skills.slice(0, MAX_SKILLS_PER_CATEGORY)
  const omittedSkills = Math.max(0, skills.length - visibleSkills.length)
  const label = titleCase(category || 'general')
  const trust = resolveTrust(visibleSkills)
  const writableCount = visibleSkills.filter((skill) => skill.suggestedCanWriteFiles).length
  const entry = {
    id: `skills.${category}`,
    slug: `skills-${category}`,
    title: `Skills: ${label}`,
    source: 'skill',
    status: 'available',
    summary: `${visibleSkills.length} ${label.toLowerCase()} skill summaries are discoverable through the ADDOM skill registry without loading full skill prompt bodies.`,
    permissionClass: writableCount > 0 ? 'mixed' : 'delegation',
    riskClass: writableCount > 0 ? 'medium' : 'low',
    defaultExposure: 'catalog_only',
    activation: {
      state: 'hidden_discoverable',
      reasons: ['catalog_read', 'strong_intent', 'explicit_request'],
      decay: 'hidden again after the relevant skill discovery or install task expires',
    },
    toolsAfterActivation: ['list_curated_skills', 'install_curated_skill'],
    whenToUse: [
      `Use to discover ${label.toLowerCase()} role skills before installing or delegating specialized review work.`,
      'Use list_curated_skills for the current supported OpenAI curated skill catalog when an exact install name is unclear.',
    ],
    whenNotToUse: [
      'Do not load or repeat full role prompt bodies from the registry in catalog pages.',
      'Do not install a skill to replace existing ADDOM browser, file, shell, or MCP tools.',
    ],
    examples: [{ title: 'Discover skills', toolName: 'list_curated_skills', prompt: `List curated skills for ${label.toLowerCase()} work.` }],
    related: ['builtins.skills', 'builtins.delegation'],
    provenance: {
      trust,
      sourceFile: 'src/main/moa/skill-registry.mjs',
      category,
      skillIds: visibleSkills.map((skill) => skill.id),
      ...(omittedSkills > 0 ? { omittedSkills } : {}),
      notes: trust === 'external'
        ? 'Some skill metadata is project/user supplied and is catalog data only, not model instruction.'
        : 'Generated from ADDOM curated skill registry metadata. Full role prompt bodies are intentionally omitted.',
    },
    limits: {
      pagePath: buildCapabilityCatalogPath(`skills-${category}`),
      maxSkillCategories: MAX_SKILL_CATEGORIES,
      maxSkillsPerCategory: MAX_SKILLS_PER_CATEGORY,
    },
    toolSummaries: buildSkillToolSummaries(visibleSkills),
  }
  return {
    ...assertValidCapabilityCatalogEntry(entry, { trust }),
    slug: entry.slug,
    toolSummaries: entry.toolSummaries,
  }
}

export function buildSkillCapabilityEntries({
  projectFolder = '',
  skills = listAllSkills({ projectFolder }),
} = {}) {
  return groupSkillsByCategory(skills).map(([category, entries]) => buildCategoryEntry(category, entries))
}

export function buildSkillCapabilityCatalog(options = {}) {
  const entries = buildSkillCapabilityEntries(options)
  const pages = buildCapabilityCatalogPages(entries, options)
  assertCapabilityCatalogPageCaps(pages, options)
  return { entries, pages }
}
