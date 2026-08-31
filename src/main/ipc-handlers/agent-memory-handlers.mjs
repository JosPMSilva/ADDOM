/**
 * agent-memory-handlers.mjs
 *
 * IPC handlers for agent memory management.
 * Exposes list, clear (per-role), and clearAll operations.
 */

import electron from 'electron'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { clearAllMemory, clearMemory, listMemoryRoles } from '../moa/agent-memory.mjs'
import { validateMoaProjectFolder } from './moa-project-validation.mjs'
const { ipcMain } = electron

function clean(value) {
    return String(value ?? '').trim()
}

export function registerAgentMemoryHandlers(ipcMainImpl = ipcMain) {
    /* ---- List all roles with stored memory ---- */
    handleVersioned(ipcMainImpl, 'agentMemory:list', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const validation = validateMoaProjectFolder(input.projectFolder)
        if (!validation.ok) {
            return { ok: false, error: validation.error, message: validation.message, roles: [] }
        }
        try {
            const roles = listMemoryRoles(validation.projectFolder)
            return { ok: true, roles }
        } catch (err) {
            return { ok: false, error: err?.message || String(err), roles: [] }
        }
    })

    /* ---- Clear memory for a specific role ---- */
    handleVersioned(ipcMainImpl, 'agentMemory:clear', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const roleId = clean(input.roleId)
        const validation = validateMoaProjectFolder(input.projectFolder)
        if (!validation.ok || !roleId) {
            return {
                ok: false,
                error: !validation.ok ? validation.error : 'missing_role',
                message: !validation.ok ? validation.message : 'Role ID is required.',
            }
        }
        try {
            clearMemory(validation.projectFolder, roleId)
            return { ok: true }
        } catch (err) {
            return { ok: false, error: err?.message || String(err) }
        }
    })

    /* ---- Clear all agent memory for a project ---- */
    handleVersioned(ipcMainImpl, 'agentMemory:clearAll', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const validation = validateMoaProjectFolder(input.projectFolder)
        if (!validation.ok) {
            return { ok: false, error: validation.error, message: validation.message }
        }
        try {
            clearAllMemory(validation.projectFolder)
            return { ok: true, cleared: true }
        } catch (err) {
            return { ok: false, error: err?.message || String(err) }
        }
    })
}

