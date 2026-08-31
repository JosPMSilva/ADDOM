/**
 * pipelines.mjs — IPC handlers for pipeline operations
 *
 * Channels:
 *   pipeline:list    – list all available pipelines (built-in + custom)
 *   pipeline:get     – get a single pipeline by ID
 *   pipeline:execute – execute a pipeline sequentially
 */

import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import electron from 'electron'
import { listPipelines, getPipelineById, normalizePipeline } from '../moa/pipeline-definitions.mjs'
import { executePipeline } from '../moa/pipeline-executor.mjs'
import { getSettings, setSettingsPatch } from '../settings.mjs'
import * as vault from '../vault.mjs'
import { appendEvent } from '../workspace/workspace-store.mjs'
import { createMoaEventEmitter } from '../chat/moa-event-persistence.mjs'
import { validateMoaProjectFolder } from './moa-project-validation.mjs'
import { broadcastSettingsUpdate } from './settings.mjs'

function clean(value) {
    return String(value ?? '').trim()
}

// Track active pipeline AbortControllers for cancellation
const activePipelineControllers = new Map()
const pipelineExecutionStates = new Map()
const EXECUTION_STATE_TTL_MS = 10 * 60 * 1000

function schedulePipelineExecutionStateCleanup(executionId) {
    setTimeout(() => {
        pipelineExecutionStates.delete(executionId)
    }, EXECUTION_STATE_TTL_MS).unref?.()
}

function setPipelineExecutionState(executionId, patch = {}) {
    const current = pipelineExecutionStates.get(executionId) || {
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
    pipelineExecutionStates.set(executionId, next)
    if (next.finishedAt) schedulePipelineExecutionStateCleanup(executionId)
    return next
}
const { ipcMain } = electron

function getCustomPipelinesFromSettings(settings = getSettings()) {
    if (settings?.customPipelinesEnabled !== true) return []
    return Array.isArray(settings?.customPipelines) ? settings.customPipelines : []
}

function rejectCustomPipelineAuthoring() {
    return {
        ok: false,
        error: 'custom_pipelines_disabled',
        message: 'Custom pipeline authoring is available only when enabled in advanced config.',
    }
}

export function resolvePipelineDefinitionFromInput(input = {}, settings = getSettings()) {
    const source = input && typeof input === 'object' ? input : {}
    const pipelineId = clean(source.pipelineId || source.id)
    if (pipelineId) {
        const pipeline = getPipelineById(pipelineId, {
            customPipelines: getCustomPipelinesFromSettings(settings),
        })
        if (!pipeline) {
            return { ok: false, error: 'not_found', message: `Pipeline "${pipelineId}" not found.` }
        }
        return { ok: true, pipeline, pipelineId }
    }
    if (source.pipeline && typeof source.pipeline === 'object') {
        return { ok: true, pipeline: source.pipeline, pipelineId: clean(source.pipeline.id) }
    }
    return { ok: false, error: 'missing_pipeline', message: 'Provide pipelineId or pipeline definition.' }
}

export function registerPipelineHandlers(ipcMainImpl = ipcMain) {
    /* ---- List pipelines ---- */
    handleVersioned(ipcMainImpl, 'pipeline:list', async () => {
        const settings = getSettings()
        const customPipelines = getCustomPipelinesFromSettings(settings)
        const pipelines = listPipelines({ customPipelines })
        return { ok: true, pipelines, count: pipelines.length }
    })

    /* ---- Get pipeline by ID ---- */
    handleVersioned(ipcMainImpl, 'pipeline:get', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const pipelineId = clean(input.pipelineId || input.id)
        if (!pipelineId) return { ok: false, error: 'missing_id', message: 'Pipeline ID is required.' }
        const pipeline = getPipelineById(pipelineId, {
            customPipelines: getCustomPipelinesFromSettings(),
        })
        if (!pipeline) return { ok: false, error: 'not_found', message: `Pipeline "${pipelineId}" not found.` }
        return { ok: true, pipeline }
    })

    /* ---- Save custom pipeline ---- */
    handleVersioned(ipcMainImpl, 'pipeline:save', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const pipelineDef = input.pipeline
        if (!pipelineDef || typeof pipelineDef !== 'object') {
            return { ok: false, error: 'invalid', message: 'Pipeline definition is required.' }
        }
        const normalized = normalizePipeline({ ...pipelineDef, source: 'custom' })
        if (normalized.steps.length === 0) {
            return { ok: false, error: 'no_steps', message: 'Pipeline must have at least one step.' }
        }
        const settings = getSettings()
        if (settings?.customPipelinesEnabled !== true) return rejectCustomPipelineAuthoring()
        const existing = Array.isArray(settings?.customPipelines) ? settings.customPipelines : []
        const filtered = existing.filter((p) => clean(p.id).toLowerCase() !== normalized.id.toLowerCase())
        filtered.push(normalized)
        const nextSettings = await setSettingsPatch({ customPipelines: filtered })
        broadcastSettingsUpdate({
            changedKeys: ['customPipelines'],
            settings: nextSettings,
        })
        return { ok: true, pipeline: normalized }
    })

    /* ---- Delete custom pipeline ---- */
    handleVersioned(ipcMainImpl, 'pipeline:delete', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const pipelineId = clean(input.pipelineId || input.id)
        if (!pipelineId) return { ok: false, error: 'missing_id' }
        const settings = getSettings()
        if (settings?.customPipelinesEnabled !== true) return rejectCustomPipelineAuthoring()
        const existing = Array.isArray(settings?.customPipelines) ? settings.customPipelines : []
        const filtered = existing.filter((p) => clean(p.id).toLowerCase() !== pipelineId.toLowerCase())
        if (filtered.length === existing.length) {
            return { ok: false, error: 'not_found', message: 'Custom pipeline not found.' }
        }
        const nextSettings = await setSettingsPatch({ customPipelines: filtered })
        broadcastSettingsUpdate({
            changedKeys: ['customPipelines'],
            settings: nextSettings,
        })
        return { ok: true, deleted: true }
    })

    handleVersioned(ipcMainImpl, 'pipeline:get-status', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const executionId = clean(input.executionId)
        if (!executionId) return { ok: false, error: 'missing_id', message: 'Execution ID is required.' }
        const state = pipelineExecutionStates.get(executionId)
        if (!state) return { ok: false, error: 'not_found', message: 'No pipeline execution with that ID.' }
        return { ok: true, ...state }
    })

    const startPipelineExecution = async (event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const resolvedPipeline = resolvePipelineDefinitionFromInput(input)
        if (!resolvedPipeline.ok) return resolvedPipeline
        const pipeline = resolvedPipeline.pipeline

        const projectValidation = validateMoaProjectFolder(input.projectFolder)
        if (!projectValidation.ok) return projectValidation
        const { projectFolder } = projectValidation

        const settings = getSettings()
        const moaRoles = Array.isArray(settings.moaRoles) ? settings.moaRoles : []

        const initialContext = clean(input.initialContext || input.context)
        const projectId = clean(input.projectId)
        const threadId = clean(input.threadId)
        const turnId = clean(input.turnId) || `turn_pipeline_${Date.now()}`
        const stepId = clean(input.stepId) || `${turnId}:step:pipeline`

        const send = (channel, data) => {
            if (!event?.sender || event.sender.isDestroyed()) return
            sendVersioned(event.sender, channel, data)
        }
        const persistTimelineEvent = (kind, { role = '', content = '', meta = {}, turn = turnId } = {}) => {
            if (!threadId) return
            try { appendEvent(threadId, { kind, role, content, meta, turnId: turn }) } catch { /* non-fatal */ }
        }

        const executionId = `pipe_exec_${Date.now()}`
        const controller = new AbortController()
        activePipelineControllers.set(executionId, controller)
        setPipelineExecutionState(executionId, {
            status: 'running',
            startedAt: Date.now(),
            finishedAt: 0,
            result: null,
            error: '',
            message: '',
            pipelineId: clean(pipeline?.id),
            pipelineName: clean(pipeline?.name),
            threadId,
            turnId,
            stepId,
        })

        const emitMoaEvent = createMoaEventEmitter({
            send,
            persistTimelineEvent,
            activeThreadId: threadId,
            activeTurnId: turnId,
            stepId,
            stepSequence: 0,
        })
        const emitWithExecutionId = (channel, data = {}) => emitMoaEvent(channel, { executionId, ...data })

        ;(async () => {
            try {
                const result = await executePipeline(pipeline, {
                    projectId,
                    threadId,
                    turnId,
                    stepId,
                    projectFolder,
                    moaRoles,
                    vaultGetKey: vault.getKey,
                    emitMoaEvent: emitWithExecutionId,
                    initialContext,
                    abortSignal: controller.signal,
                })
                const status = result?.ok
                    ? 'completed'
                    : String(result?.error || '').trim().toLowerCase() === 'aborted'
                        ? 'aborted'
                        : 'failed'
                setPipelineExecutionState(executionId, {
                    status,
                    finishedAt: Date.now(),
                    result,
                    error: result?.ok ? '' : String(result?.error || ''),
                    message: result?.ok ? '' : String(result?.message || result?.error || ''),
                })
            } catch (err) {
                setPipelineExecutionState(executionId, {
                    status: controller.signal.aborted ? 'aborted' : 'failed',
                    finishedAt: Date.now(),
                    result: null,
                    error: String(err?.message || 'execution_error'),
                    message: String(err?.message || 'Pipeline execution failed.'),
                })
            } finally {
                activePipelineControllers.delete(executionId)
            }
        })()

        return {
            ok: true,
            executionId,
            status: 'running',
            pipelineId: clean(pipeline?.id),
            pipelineName: clean(pipeline?.name),
        }
    }

    /* ---- Execute pipeline ---- */
    handleVersioned(ipcMainImpl, 'pipeline:execute', async (event, payload = {}) => {
        const started = await startPipelineExecution(event, payload)
        if (!started?.ok || !started.executionId) return started
        while (true) {
            const state = pipelineExecutionStates.get(started.executionId)
            if (!state) {
                return { ok: false, error: 'not_found', message: 'Pipeline execution state expired.' }
            }
            if (state.status === 'completed') return { ...(state.result || { ok: true }), executionId: started.executionId }
            if (state.status === 'aborted') {
                return {
                    ...(state.result || { ok: false, error: 'aborted', message: 'Pipeline execution was aborted.' }),
                    executionId: started.executionId,
                }
            }
            if (state.status === 'failed') {
                return {
                    ...(state.result || { ok: false, error: state.error || 'execution_error', message: state.message || 'Pipeline execution failed.' }),
                    executionId: started.executionId,
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 50))
        }
    })

    handleVersioned(ipcMainImpl, 'pipeline:start', async (event, payload = {}) => {
        return await startPipelineExecution(event, payload)
    })

    /* ---- Abort a running pipeline ---- */
    handleVersioned(ipcMainImpl, 'pipeline:abort', async (_event, payload = {}) => {
        const input = payload && typeof payload === 'object' ? payload : {}
        const executionId = clean(input.executionId)
        if (!executionId) return { ok: false, error: 'missing_id', message: 'Execution ID is required.' }
        const controller = activePipelineControllers.get(executionId)
        if (!controller) return { ok: false, error: 'not_found', message: 'No active pipeline with that ID.' }
        setPipelineExecutionState(executionId, { status: 'aborting' })
        controller.abort()
        return { ok: true, aborted: true }
    })
}
