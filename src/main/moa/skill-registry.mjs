/**
 * skill-registry.mjs
 *
 * Unified skill registry that merges the canonical built-in native-agent
 * catalog with user-defined project skills from .addom/skills/*.json.
 *
 * Provides a single API surface for listing, searching, filtering,
 * and installing skills as MoA agent roles.
 */

import fs from 'fs'
import path from 'path'
import { listRoleTemplates } from './role-templates.mjs'

/* ------------------------------------------------------------------ */
/*  Schema helpers                                                     */
/* ------------------------------------------------------------------ */

const VALID_CATEGORIES = new Set([
    'security', 'frontend', 'backend', 'quality', 'engineering',
    'devops', 'testing', 'content', 'web', 'performance', 'desktop',
    'general',
])

function clean(value) {
    return String(value ?? '').trim()
}

function normalizeSkill(raw = {}) {
    const row = raw && typeof raw === 'object' ? raw : {}
    const id = clean(row.id)
    if (!id) return null

    const category = VALID_CATEGORIES.has(clean(row.category).toLowerCase())
        ? clean(row.category).toLowerCase()
        : 'general'

    return {
        id,
        version: Number.isFinite(Number(row.version)) ? Math.max(1, Math.round(Number(row.version))) : 1,
        category,
        tags: Array.isArray(row.tags)
            ? row.tags.map((t) => clean(t).toLowerCase()).filter(Boolean).slice(0, 20)
            : [],
        label: clean(row.label) || id,
        description: clean(row.description),
        defaultName: clean(row.defaultName) || clean(row.label) || id,
        defaultSystemPrompt: clean(row.defaultSystemPrompt),
        recommendedUseCases: Array.isArray(row.recommendedUseCases)
            ? row.recommendedUseCases.map((item) => clean(item)).filter(Boolean).slice(0, 12)
            : [],
        suggestedCanWriteFiles: !!row.suggestedCanWriteFiles,
        suggestedProviderId: clean(row.suggestedProviderId),
        suggestedModel: clean(row.suggestedModel),
        source: clean(row.source) || 'unknown',
    }
}

/* ------------------------------------------------------------------ */
/*  Catalog normalization                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Local project skills loader                                        */
/* ------------------------------------------------------------------ */

function loadLocalSkills(projectFolder) {
    if (!projectFolder) return []
    const skillsDir = path.join(projectFolder, '.addom', 'skills')
    try {
        if (!fs.existsSync(skillsDir)) return []
        const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith('.json'))
        const skills = []
        for (const file of files.slice(0, 50)) {
            try {
                const raw = JSON.parse(fs.readFileSync(path.join(skillsDir, file), 'utf8'))
                const entries = Array.isArray(raw) ? raw : (raw?.skills ? raw.skills : [raw])
                for (const entry of entries) {
                    const skill = normalizeSkill({ ...entry, source: `local/${file}` })
                    if (skill) skills.push(skill)
                }
            } catch { /* skip malformed skill files */ }
        }
        return skills
    } catch {
        return []
    }
}

/* ------------------------------------------------------------------ */
/*  Unified registry                                                   */
/* ------------------------------------------------------------------ */

/**
 * List all available skills from all sources, deduplicated by ID.
 * Priority order: local project skill > built-in catalog.
 *
 * @param {{ projectFolder?: string }} options
 * @returns {Array<object>}
 */
export function listAllSkills({ projectFolder = '' } = {}) {
    const byId = new Map()

    // 1. Canonical built-in catalog (lowest priority)
    for (const template of listRoleTemplates()) {
        const skill = normalizeSkill(template)
        if (skill) byId.set(skill.id, skill)
    }

    // 2. Local project skills (highest priority)
    for (const skill of loadLocalSkills(projectFolder)) {
        byId.set(skill.id, skill)
    }

    return Array.from(byId.values())
}

/**
 * Find a skill by ID across all sources.
 *
 * @param {string} skillId
 * @param {{ projectFolder?: string }} options
 * @returns {object|null}
 */
export function getSkillById(skillId, { projectFolder = '' } = {}) {
    const id = clean(skillId).toLowerCase()
    if (!id) return null
    const all = listAllSkills({ projectFolder })
    return all.find((s) => s.id.toLowerCase() === id) || null
}

/**
 * Search skills by query string (searches name, description, tags).
 *
 * @param {string} query
 * @param {{ projectFolder?: string, category?: string }} options
 * @returns {Array<object>}
 */
export function searchSkills(query, { projectFolder = '', category = '' } = {}) {
    const q = clean(query).toLowerCase()
    const cat = clean(category).toLowerCase()
    let skills = listAllSkills({ projectFolder })

    if (cat) {
        skills = skills.filter((s) => s.category === cat)
    }

    if (!q) return skills

    return skills.filter((s) => {
        const searchable = [
            s.id, s.label, s.description, s.defaultName,
            ...s.tags, ...s.recommendedUseCases,
        ].join(' ').toLowerCase()
        return searchable.includes(q)
    })
}

/**
 * List all distinct categories from available skills.
 *
 * @param {{ projectFolder?: string }} options
 * @returns {Array<string>}
 */
export function listCategories({ projectFolder = '' } = {}) {
    const all = listAllSkills({ projectFolder })
    const cats = new Set(all.map((s) => s.category).filter(Boolean))
    return Array.from(cats).sort()
}

/**
 * Convert a skill definition into a role-ready object
 * suitable for saving via setSettingsPatch({ moaRoles: [...] }).
 *
 * @param {object} skill - Skill definition from the registry
 * @param {{ providerId: string, model: string, name?: string }} overrides
 * @returns {object} - Role object ready for normalizeMoaRoles()
 */
export function skillToRole(skill, overrides = {}) {
    const providerId = clean(overrides.providerId) || clean(skill.suggestedProviderId)
    const model = clean(overrides.model) || clean(skill.suggestedModel)
    const name = clean(overrides.name) || clean(skill.defaultName) || clean(skill.label)
    return {
        id: `role_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        name,
        providerId,
        model,
        canWriteFiles: false,
        systemPrompt: clean(skill.defaultSystemPrompt).slice(0, 2000),
        templateId: clean(skill.id),
        templateVersion: skill.version || 1,
        templateLabel: clean(skill.label),
    }
}

/**
 * Invalidate the cached catalog (useful after importing new skills).
 */
export function invalidateSkillCache() {
    // Built-ins are immutable during an app session; local skills are read per call.
}
