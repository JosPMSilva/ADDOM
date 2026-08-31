/**
 * skills.mjs — IPC handlers for the skill registry
 *
 * Channels:
 *   skills:list       – list all skills (with optional category/search filter)
 *   skills:categories – list all available categories
 *   skills:get        – get a single skill by ID
 *   skills:search     – search skills by query
 *   skills:install    – convert a skill into a MoA role and save to settings
 */

import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { ipcMain } from 'electron'
import {
    listAllSkills,
    listCategories,
    getSkillById,
    searchSkills,
    skillToRole,
} from '../moa/skill-registry.mjs'
import { getSettings, setSettingsPatch, normalizeMoaRoles } from '../settings.mjs'
import { broadcastSettingsUpdate } from './settings.mjs'

function clean(value) {
    return String(value ?? '').trim()
}

export function registerSkillHandlers() {
    /* ---- List all skills ---- */
    handleVersioned(ipcMain, 'skills:list', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const projectFolder = clean(input.projectFolder)
        const category = clean(input.category)
        const skills = category
            ? searchSkills('', { projectFolder, category })
            : listAllSkills({ projectFolder })
        return { ok: true, skills, count: skills.length }
    })

    /* ---- List categories ---- */
    handleVersioned(ipcMain, 'skills:categories', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const projectFolder = clean(input.projectFolder)
        const categories = listCategories({ projectFolder })
        return { ok: true, categories }
    })

    /* ---- Get single skill ---- */
    handleVersioned(ipcMain, 'skills:get', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const skillId = clean(input.skillId || input.id)
        if (!skillId) return { ok: false, error: 'missing_id', message: 'Skill ID is required.' }
        const projectFolder = clean(input.projectFolder)
        const skill = getSkillById(skillId, { projectFolder })
        if (!skill) return { ok: false, error: 'not_found', message: `Skill "${skillId}" not found.` }
        return { ok: true, skill }
    })

    /* ---- Search skills ---- */
    handleVersioned(ipcMain, 'skills:search', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const query = clean(input.query)
        const projectFolder = clean(input.projectFolder)
        const category = clean(input.category)
        const results = searchSkills(query, { projectFolder, category })
        return { ok: true, skills: results, count: results.length, query }
    })

    /* ---- Install skill as MoA role ---- */
    handleVersioned(ipcMain, 'skills:install', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const skillId = clean(input.skillId || input.id)
        if (!skillId) return { ok: false, error: 'missing_id', message: 'Skill ID is required.' }

        const projectFolder = clean(input.projectFolder)
        const skill = getSkillById(skillId, { projectFolder })
        if (!skill) return { ok: false, error: 'not_found', message: `Skill "${skillId}" not found.` }

        const providerId = clean(input.providerId)
        const model = clean(input.model)
        if (!providerId) return { ok: false, error: 'missing_provider', message: 'Provider is required.' }
        if (!model) return { ok: false, error: 'missing_model', message: 'Model is required.' }

        const settings = getSettings()
        const existingRoles = Array.isArray(settings.moaRoles) ? settings.moaRoles : []

        if (existingRoles.length >= 20) {
            return { ok: false, error: 'max_roles_reached', message: 'Maximum of 20 agent roles allowed.' }
        }

        const customName = clean(input.name)
        const role = skillToRole(skill, {
            providerId,
            model,
            name: customName || undefined,
        })

        // Check for duplicate names
        const roleName = clean(role.name).toLowerCase()
        const duplicate = existingRoles.find((r) => clean(r.name).toLowerCase() === roleName)
        if (duplicate) {
            return { ok: false, error: 'duplicate_name', message: `A role named "${role.name}" already exists.` }
        }

        const nextRoles = normalizeMoaRoles([...existingRoles, role])

        let nextSettings = null
        try {
            nextSettings = await setSettingsPatch({ moaRoles: nextRoles })
        } catch (err) {
            return { ok: false, error: 'save_failed', message: `Failed to save role: ${err.message}` }
        }

        broadcastSettingsUpdate({
            changedKeys: ['moaRoles'],
            settings: nextSettings,
        })

        return {
            ok: true,
            role: nextSettings.moaRoles.find((row) => row.id === role.id) || null,
            skill,
            moaRoles: nextSettings.moaRoles,
        }
    })
}
