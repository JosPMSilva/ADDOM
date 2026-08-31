/**
 * pipeline-executor.mjs
 *
 * Sequential pipeline executor that chains agent outputs.
 * Agent A's output feeds into Agent B as injected_context,
 * enabling compound workflows like: Review → Fix → Test.
 *
 * Runs steps sequentially via the existing executeDelegation() function,
 * calling it with a single task per step.
 */

import crypto from 'node:crypto'
import { normalizeMoaPolicy } from './moa-policy.mjs'
import { getSettings } from '../settings.mjs'
import { enhanceTaskContext } from './prompt-enhancer.mjs'

function cleanString(value) {
    return String(value ?? '').trim()
}

function normalizeStatus(value) {
    return cleanString(value).toLowerCase()
}

/* ------------------------------------------------------------------ */
/*  Pipeline validation                                                */
/* ------------------------------------------------------------------ */

/**
 * Validate a pipeline definition.
 *
 * @param {object} pipeline
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePipeline(pipeline) {
    const errors = []
    if (!pipeline || typeof pipeline !== 'object') {
        errors.push('Pipeline must be an object.')
        return { ok: false, errors }
    }
    if (!Array.isArray(pipeline.steps) || pipeline.steps.length === 0) {
        errors.push('Pipeline must have at least one step.')
    }
    if (pipeline.steps?.length > 8) {
        errors.push('Pipeline cannot have more than 8 steps.')
    }
    for (let i = 0; i < (pipeline.steps?.length || 0); i++) {
        const step = pipeline.steps[i]
        if (!step || typeof step !== 'object') {
            errors.push(`Step ${i + 1} is invalid.`)
            continue
        }
        if (!step.agent_role && !step.agent_role_id && !step.roleId && !step.roleName) {
            errors.push(`Step ${i + 1} must specify an agent role.`)
        }
        if (!cleanString(step.instruction)) {
            errors.push(`Step ${i + 1} must have an instruction.`)
        }
    }
    return { ok: errors.length === 0, errors }
}

/* ------------------------------------------------------------------ */
/*  Pipeline executor                                                  */
/* ------------------------------------------------------------------ */

/**
 * Execute a pipeline: run steps sequentially, chaining outputs.
 *
 * @param {object} pipeline – Pipeline definition with `steps` array
 * @param {object} options
 * @param {string} options.projectFolder
 * @param {Array} options.moaRoles
 * @param {Function} options.vaultGetKey
 * @param {Function} options.emitMoaEvent
 * @param {AbortSignal} options.abortSignal
 * @param {string} options.initialContext – Optional seed context for step 1
 * @param {Function} options.executeDelegationFn
 * @returns {Promise<object>} Pipeline result envelope
 */
export async function executePipeline(pipeline, {
    projectId = '',
    threadId = '',
    turnId = '',
    stepId: executionStepId = '',
    projectFolder,
    moaRoles = [],
    vaultGetKey,
    emitMoaEvent,
    abortSignal,
    initialContext = '',
    executeDelegationFn = null,
} = {}) {
    const validation = validatePipeline(pipeline)
    if (!validation.ok) {
        return {
            ok: false,
            error: 'invalid_pipeline',
            errors: validation.errors,
            steps: [],
        }
    }

    const pipelineId = cleanString(pipeline.id) || `pipe_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    const pipelineName = cleanString(pipeline.name) || 'Unnamed Pipeline'
    const steps = pipeline.steps
    const results = []
    let previousOutput = cleanString(initialContext)

    const settings = getSettings()
    const policy = normalizeMoaPolicy(settings?.moaPolicy)

    const emit = typeof emitMoaEvent === 'function'
        ? (channel, payload = {}) => emitMoaEvent(channel, { pipelineId, pipelineName, ...payload })
        : () => { }

    const executeDelegation = typeof executeDelegationFn === 'function'
        ? executeDelegationFn
        : (await import('../tools/agent-executor.mjs')).executeDelegation

    emit('moa:pipeline-start', {
        totalSteps: steps.length,
        stepNames: steps.map((s) => cleanString(s.roleName || s.agent_role || 'Step')),
    })

    for (let i = 0; i < steps.length; i++) {
        if (abortSignal?.aborted) {
            emit('moa:pipeline-aborted', { failedAt: i, reason: 'aborted' })
            return {
                ok: false,
                error: 'aborted',
                pipelineId,
                steps: results,
                finalOutput: previousOutput,
            }
        }

        const step = steps[i]
        const stepId = cleanString(step.stepId) || `step_${i + 1}`
        const roleName = cleanString(step.roleName || step.agent_role)
        const roleId = cleanString(step.roleId || step.agent_role_id)

        emit('moa:pipeline-step-start', { stepIndex: i, stepId, roleName })

        // Build task with chained context
        let task = {
            task_id: stepId,
            agent_role: roleName,
            agent_role_id: roleId,
            instruction: cleanString(step.instruction),
            injected_context: step.injectPreviousOutput !== false && previousOutput
                ? `--- Previous Step Output (use this context) ---\n\n${previousOutput}`
                : cleanString(step.injected_context || ''),
            expected_output_format: cleanString(
                step.expected_output_format || 'Provide concise, actionable output. Include file references when relevant.'
            ),
        }

        // Apply prompt enhancement if enabled
        if (policy.promptEnhancementEnabled && projectFolder) {
            task = enhanceTaskContext(task, { projectFolder, enabled: true, memoryEnabled: policy.agentMemoryEnabled })
        }

        try {
            const envelope = await executeDelegation(
                [task],
                Array.isArray(moaRoles) ? moaRoles : [],
                vaultGetKey,
                projectFolder,
                emit,
                abortSignal,
                {
                    projectId,
                    threadId,
                    turnId,
                    stepId: executionStepId || stepId,
                    route: 'pipeline',
                    pipelineId,
                    pipelineStep: i,
                    pipelineStepId: stepId,
                },
            )

            const agentResults = Array.isArray(envelope?.agents) && envelope.agents.length > 0
                ? envelope.agents
                : (Array.isArray(envelope?.results) ? envelope.results : [])
            const primaryResult = agentResults[0] || null
            const agentOutput = primaryResult?.output || primaryResult?.agentOutput || ''
            const status = cleanString(primaryResult?.status || envelope?.status || 'completed') || 'completed'

            results.push({
                stepId,
                stepIndex: i,
                roleName,
                roleId,
                status,
                output: agentOutput,
                envelope,
            })

            emit('moa:pipeline-step-complete', {
                stepIndex: i,
                stepId,
                roleName,
                status,
                outputLength: agentOutput.length,
            })

            if (normalizeStatus(status) !== 'completed') {
                emit('moa:pipeline-failed', { failedAt: i, stepId, reason: 'step_failed' })
                return {
                    ok: false,
                    error: 'step_failed',
                    failedStep: stepId,
                    pipelineId,
                    steps: results,
                    finalOutput: previousOutput,
                }
            }

            // Chain output to next step
            previousOutput = agentOutput || previousOutput
        } catch (err) {
            results.push({
                stepId,
                stepIndex: i,
                roleName,
                roleId,
                status: 'error',
                output: '',
                error: err?.message || String(err),
            })

            emit('moa:pipeline-failed', { failedAt: i, stepId, reason: err?.message || 'unknown' })

            return {
                ok: false,
                error: 'execution_error',
                failedStep: stepId,
                pipelineId,
                steps: results,
                finalOutput: previousOutput,
            }
        }
    }

    emit('moa:pipeline-done', {
        totalSteps: steps.length,
        completedSteps: results.length,
        finalOutputLength: previousOutput.length,
    })

    return {
        ok: true,
        pipelineId,
        pipelineName,
        steps: results,
        finalOutput: previousOutput,
    }
}
