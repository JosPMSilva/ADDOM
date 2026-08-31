/**
 * create-role-from-chat.mjs
 *
 * IPC handler: programmatically create a new agent role from the renderer.
 * Used by the @role chat command and any future UI that needs to create roles
 * outside the Settings form.
 */

import crypto from 'node:crypto'
import { ipcMain } from '../electron-api.mjs'
import { getSettings, setSettingsPatch, normalizeMoaRoles } from '../settings.mjs'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { broadcastSettingsUpdate } from './settings.mjs'

function clean(value) {
    return String(value ?? '').trim()
}

/**
 * Validate and create a new MoA role, persisting it to settings.
 *
 * @param {object} input
 * @param {string} input.name          - Role name (required, must be unique)
 * @param {string} input.systemPrompt  - Role instructions / system prompt (optional, max 2000 chars)
 * @param {string} input.providerId    - Provider ID (required)
 * @param {string} input.model         - Model ID (required)
 * @param {boolean} input.canWriteFiles - Whether the agent can stage file writes
 * @returns {{ ok: boolean, role?: object, error?: string, message?: string }}
 */
export function validateAndBuildRole(input = {}) {
    const name = clean(input.name)
    if (!name) return { ok: false, error: 'missing_name', message: 'Role name is required.' }

    const providerId = clean(input.providerId)
    if (!providerId) return { ok: false, error: 'missing_provider', message: 'Provider is required.' }

    const model = clean(input.model)
    if (!model) return { ok: false, error: 'missing_model', message: 'Model is required.' }

    const settings = getSettings()
    const existingRoles = Array.isArray(settings.moaRoles) ? settings.moaRoles : []

    const duplicate = existingRoles.find(
        (r) => clean(r.name).toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
        return {
            ok: false,
            error: 'duplicate_name',
            message: `A role named "${name}" already exists.`,
        }
    }

    const role = {
        id: `role_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        name,
        providerId,
        model: model.slice(0, 120),
        canWriteFiles: !!input.canWriteFiles,
    }

    const systemPrompt = clean(input.systemPrompt)
    if (systemPrompt) role.systemPrompt = systemPrompt.slice(0, 2000)

    const templateId = clean(input.templateId)
    if (templateId) role.templateId = templateId.slice(0, 80)

    const templateLabel = clean(input.templateLabel)
    if (templateLabel) role.templateLabel = templateLabel.slice(0, 80)

    return { ok: true, role }
}

export async function createPersistentRoleFromDefinition(input = {}) {
    const result = validateAndBuildRole(input)
    if (!result.ok) return result

    const settings = getSettings()
    const existingRoles = Array.isArray(settings.moaRoles) ? settings.moaRoles : []

    if (existingRoles.length >= 20) {
        return {
            ok: false,
            error: 'max_roles_reached',
            message: 'Maximum of 20 agent roles allowed.',
        }
    }

    const nextRoles = normalizeMoaRoles([...existingRoles, result.role])

    let nextSettings = null
    try {
        nextSettings = await setSettingsPatch({ moaRoles: nextRoles })
    } catch (err) {
        return {
            ok: false,
            error: 'save_failed',
            message: `Failed to save role: ${err.message}`,
        }
    }

    broadcastSettingsUpdate({
        changedKeys: ['moaRoles'],
        settings: nextSettings,
    })

    return {
        ok: true,
        role: nextSettings.moaRoles.find((role) => role.id === result.role.id) || null,
        moaRoles: nextSettings.moaRoles,
    }
}

export function registerCreateRoleHandler() {
    handleVersioned(ipcMain, 'agents:create-role', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        return createPersistentRoleFromDefinition(input)
    })
}
