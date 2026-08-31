/**
 * council.mjs — IPC handlers for council operations
 *
 * Channels:
 *   council:execute  – execute a council session (parallel dispatch + synthesis)
 */

import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import electron from 'electron'
import { executeCouncil } from '../moa/council-mode.mjs'
import { getSettings } from '../settings.mjs'
import * as vault from '../vault.mjs'
import { appendEvent } from '../workspace/workspace-store.mjs'
import { createMoaEventEmitter } from '../chat/moa-event-persistence.mjs'
import { validateMoaProjectFolder } from './moa-project-validation.mjs'

function clean(value) {
    return String(value ?? '').trim()
}

// Track active council AbortControllers for cancellation
const activeCouncilControllers = new Map()
const councilExecutionStates = new Map()
const EXECUTION_STATE_TTL_MS = 10 * 60 * 1000

function scheduleCouncilExecutionStateCleanup(executionId) {
    setTimeout(() => {
        councilExecutionStates.delete(executionId)
    }, EXECUTION_STATE_TTL_MS).unref?.()
}

function setCouncilExecutionState(executionId, patch = {}) {
    const current = councilExecutionStates.get(executionId) || {
        executionId,
        status: 'running',
        result: null,
        message: '',
        error: '',
        startedAt: Date.now(),
        finishedAt: 0,
    }
    const next = {
        ...current,
        ...patch,
    }
    councilExecutionStates.set(executionId, next)
    if (next.finishedAt) scheduleCouncilExecutionStateCleanup(executionId)
    return next
}
const { ipcMain } = electron

export function registerCouncilHandlers(ipcMainImpl = ipcMain) {
    handleVersioned(ipcMainImpl, 'council:get-status', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const executionId = clean(input.executionId)
        if (!executionId) return { ok: false, error: 'missing_id', message: 'Execution ID is required.' }
        const state = councilExecutionStates.get(executionId)
        if (!state) return { ok: false, error: 'not_found', message: 'No council execution with that ID.' }
        return { ok: true, ...state }
    })

    const startCouncilExecution = async (event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const instruction = clean(input.instruction)
        if (!instruction) return { ok: false, error: 'missing_instruction', message: 'Council instruction is required.' }

        const projectValidation = validateMoaProjectFolder(input.projectFolder)
        if (!projectValidation.ok) return projectValidation
        const { projectFolder } = projectValidation

        const settings = getSettings()
        const moaRoles = Array.isArray(settings.moaRoles) ? settings.moaRoles : []

        const councilRoleIds = Array.isArray(input.councilRoleIds)
            ? input.councilRoleIds.map((id) => clean(id)).filter(Boolean)
            : undefined

        const projectId = clean(input.projectId)
        const threadId = clean(input.threadId)
        const turnId = clean(input.turnId) || `turn_council_${Date.now()}`
        const stepId = clean(input.stepId) || `${turnId}:step:council`

        // Build real event emitter
        const send = (channel, data) => {
            if (!event?.sender || event.sender.isDestroyed()) return
            sendVersioned(event.sender, channel, data)
        }
        const persistTimelineEvent = (kind, { role = '', content = '', meta = {}, turn = turnId } = {}) => {
            if (!threadId) return
            try { appendEvent(threadId, { kind, role, content, meta, turnId: turn }) } catch { /* non-fatal */ }
        }
        const emitMoaEvent = createMoaEventEmitter({
            send,
            persistTimelineEvent,
            activeThreadId: threadId,
            activeTurnId: turnId,
            stepId,
            stepSequence: 0,
        })

        const executionId = `council_exec_${Date.now()}`
        const controller = new AbortController()
        activeCouncilControllers.set(executionId, controller)
        setCouncilExecutionState(executionId, {
            status: 'running',
            startedAt: Date.now(),
            finishedAt: 0,
            result: null,
            error: '',
            message: '',
            threadId,
            turnId,
            stepId,
        })

        const emitWithExecutionId = (channel, data = {}) => emitMoaEvent(channel, { executionId, ...data })

        ;(async () => {
            try {
                const result = await executeCouncil({
                    instruction,
                    projectId,
                    threadId,
                    turnId,
                    stepId,
                    moaRoles,
                    vaultGetKey: vault.getKey,
                    projectFolder,
                    emitMoaEvent: emitWithExecutionId,
                    abortSignal: controller.signal,
                    councilRoleIds,
                    maxMembers: Number(input.maxMembers) || 5,
                })
                const status = result?.ok
                    ? 'completed'
                    : String(result?.error || '').trim().toLowerCase() === 'aborted'
                        ? 'aborted'
                        : 'failed'
                setCouncilExecutionState(executionId, {
                    status,
                    finishedAt: Date.now(),
                    result,
                    error: result?.ok ? '' : String(result?.error || ''),
                    message: result?.ok ? '' : String(result?.message || result?.error || ''),
                })
            } catch (err) {
                setCouncilExecutionState(executionId, {
                    status: controller.signal.aborted ? 'aborted' : 'failed',
                    finishedAt: Date.now(),
                    result: null,
                    error: String(err?.message || 'execution_error'),
                    message: String(err?.message || 'Council execution failed.'),
                })
            } finally {
                activeCouncilControllers.delete(executionId)
            }
        })()

        return { ok: true, executionId, status: 'running' }
    }

    handleVersioned(ipcMainImpl, 'council:execute', async (event, payload = {}) => {
        const started = await startCouncilExecution(event, payload)
        if (!started?.ok || !started.executionId) return started

        while (true) {
            const state = councilExecutionStates.get(started.executionId)
            if (!state) {
                return { ok: false, error: 'not_found', message: 'Council execution state expired.' }
            }
            if (state.status === 'completed') return { ...(state.result || { ok: true }), executionId: started.executionId }
            if (state.status === 'aborted') {
                return {
                    ...(state.result || { ok: false, error: 'aborted', message: 'Council execution was aborted.' }),
                    executionId: started.executionId,
                }
            }
            if (state.status === 'failed') {
                return {
                    ...(state.result || { ok: false, error: state.error || 'execution_error', message: state.message || 'Council execution failed.' }),
                    executionId: started.executionId,
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 50))
        }
    })

    handleVersioned(ipcMainImpl, 'council:start', async (event, payload = {}) => {
        return await startCouncilExecution(event, payload)
    })

    /* ---- Abort a running council ---- */
    handleVersioned(ipcMainImpl, 'council:abort', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const executionId = clean(input.executionId)
        if (!executionId) return { ok: false, error: 'missing_id', message: 'Execution ID is required.' }
        const controller = activeCouncilControllers.get(executionId)
        if (!controller) return { ok: false, error: 'not_found', message: 'No active council with that ID.' }
        setCouncilExecutionState(executionId, { status: 'aborting' })
        controller.abort()
        return { ok: true, aborted: true }
    })
}
