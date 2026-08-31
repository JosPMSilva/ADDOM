/**
 * council-mode.mjs
 *
 * LLM Council orchestrator: sends the same task to N different
 * model/role combinations in parallel, then synthesizes the
 * results into a consensus report.
 *
 * Flow:
 *   1. Clone the user task for each council member (different roles/models)
 *   2. Dispatch all clones in parallel via executeDelegation
 *   3. Collect outputs
 *   4. Run synthesis to merge into consensus
 */

import crypto from 'node:crypto'
import { buildSynthesisPrompts } from './council-synthesizer.mjs'
import { estimateDelegationCost } from './cost-estimator.mjs'
import { scoreRoleForTask } from './role-fit-scoring.mjs'

function cleanString(value) {
    return String(value ?? '').trim()
}

function clampCouncilMemberCount(value, fallback = 3) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return fallback
    return Math.max(2, Math.min(5, Math.round(n)))
}

function buildCouncilSelectionTask(instruction = '') {
    return {
        instruction: cleanString(instruction),
        goal: cleanString(instruction),
        task_type: 'review',
        specialty: 'review',
    }
}

/**
 * Resolve which roles should participate in the council.
 * Picks an explicit subset when requested, otherwise scores roles against the
 * council task and chooses a bounded top slice instead of faning out to every role.
 *
 * @param {Array} moaRoles — all configured MoA roles
 * @param {{ councilRoleIds?: string[], maxMembers?: number, instruction?: string }} options
 * @returns {Array}
 */
export function resolveCouncilMembers(moaRoles, { councilRoleIds, maxMembers = 3, instruction = '' } = {}) {
    const roles = Array.isArray(moaRoles) ? moaRoles : []
    if (!roles.length) return []
    const memberCap = clampCouncilMemberCount(maxMembers, 3)

    // If specific role IDs are requested, use those
    if (Array.isArray(councilRoleIds) && councilRoleIds.length > 0) {
        const idSet = new Set(councilRoleIds.map((id) => cleanString(id).toLowerCase()))
        return roles.filter((r) => idSet.has(cleanString(r.id).toLowerCase())).slice(0, memberCap)
    }

    const selectionTask = buildCouncilSelectionTask(instruction)
    const scored = roles
        .map((role) => ({
            role,
            fit: scoreRoleForTask(selectionTask, role),
        }))
        .sort((left, right) => (
            Number(right?.fit?.score || 0) - Number(left?.fit?.score || 0)
            || cleanString(left?.role?.name).localeCompare(cleanString(right?.role?.name))
        ))

    const selected = []
    const seenRoleIds = new Set()
    for (const entry of scored) {
        const roleId = cleanString(entry?.role?.id).toLowerCase()
        if (!roleId || seenRoleIds.has(roleId)) continue
        if (selected.length >= memberCap) break
        if (Number(entry?.fit?.score || 0) <= 0 && selected.length >= 2) continue
        selected.push(entry.role)
        seenRoleIds.add(roleId)
    }

    if (selected.length < 2) {
        for (const role of roles) {
            const roleId = cleanString(role?.id).toLowerCase()
            if (!roleId || seenRoleIds.has(roleId)) continue
            selected.push(role)
            seenRoleIds.add(roleId)
            if (selected.length >= Math.min(memberCap, Math.max(2, roles.length))) break
        }
    }

    return selected.slice(0, memberCap)
}

/**
 * Build council tasks — clone the same instruction for each member.
 *
 * @param {string} instruction — the user's task
 * @param {Array} councilMembers — resolved roles
 * @returns {Array<object>}
 */
export function buildCouncilTasks(instruction, councilMembers) {
    return councilMembers.map((role, i) => ({
        task_id: `council_${i + 1}_${cleanString(role.id).slice(0, 20)}`,
        agent_role_id: cleanString(role.id),
        agent_role: cleanString(role.name),
        instruction: cleanString(instruction),
        injected_context: `You are participating in an LLM Council review. Multiple independent AI models are analyzing the same task. Provide your honest, thorough analysis. Do not hedge or qualify excessively — be direct and specific.`,
        expected_output_format: 'Detailed analysis with specific findings, file references, and actionable recommendations.',
    }))
}

/**
 * Execute a council session.
 *
 * @param {object} options
 * @param {string} options.instruction — the task to analyze
 * @param {Array} options.moaRoles — all configured roles
 * @param {Function} options.vaultGetKey
 * @param {string} options.projectFolder
 * @param {Function} options.emitMoaEvent
 * @param {AbortSignal} options.abortSignal
 * @param {Function} options.executeDelegationFn
 * @param {string[]} options.councilRoleIds — optional subset of roles
 * @param {number} options.maxMembers — max council members (default 5)
 * @returns {Promise<object>}
 */
export async function executeCouncil({
    instruction,
    projectId = '',
    threadId = '',
    turnId = '',
    stepId = '',
    moaRoles = [],
    vaultGetKey,
    projectFolder,
    emitMoaEvent,
    abortSignal,
    executeDelegationFn = null,
    councilRoleIds,
    maxMembers = 3,
} = {}) {
    const councilId = `council_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`

    const emit = typeof emitMoaEvent === 'function'
        ? (channel, payload = {}) => emitMoaEvent(channel, { councilId, ...payload })
        : () => { }

    // 1. Resolve council members
    const members = resolveCouncilMembers(moaRoles, { councilRoleIds, maxMembers, instruction })
    if (members.length === 0) {
        return {
            ok: false,
            error: 'no_members',
            message: 'No council members available. Configure at least one MoA agent role.',
            councilId,
        }
    }

    if (members.length < 2) {
        return {
            ok: false,
            error: 'insufficient_members',
            message: 'Council requires at least 2 different roles for meaningful consensus.',
            councilId,
        }
    }

    emit('moa:council-start', {
        memberCount: members.length,
        memberNames: members.map((m) => cleanString(m.name)),
        selectionMode: Array.isArray(councilRoleIds) && councilRoleIds.length > 0 ? 'explicit' : 'scored',
    })

    if (abortSignal?.aborted) {
        emit('moa:council-aborted', { reason: 'aborted' })
        return {
            ok: false,
            error: 'aborted',
            message: 'Council execution was aborted.',
            councilId,
        }
    }

    // 2. Build and dispatch council tasks (in parallel via fanout)
    const tasks = buildCouncilTasks(instruction, members)

    // Cost estimation
    const costEstimate = estimateDelegationCost({
        tasks,
        roles: moaRoles,
        strategy: 'balanced',
    })

    emit('moa:council-cost-estimate', {
        memberCount: members.length,
        estimatedTokens: costEstimate.estimatedTokens,
        estimatedUsd: costEstimate.estimatedUsd,
    })

    const executeDelegation = typeof executeDelegationFn === 'function'
        ? executeDelegationFn
        : (await import('../tools/agent-executor.mjs')).executeDelegation

    let envelope
    try {
        envelope = await executeDelegation(
            tasks,
            moaRoles,
            vaultGetKey,
            projectFolder,
            emit,
            abortSignal,
            {
                projectId,
                threadId,
                turnId,
                stepId,
                route: 'council',
                councilId,
                initiator: 'council',
                pattern: 'council',
            },
        )
    } catch (err) {
        if (abortSignal?.aborted) {
            emit('moa:council-aborted', { reason: 'aborted' })
            return {
                ok: false,
                error: 'aborted',
                message: 'Council execution was aborted.',
                councilId,
            }
        }
        emit('moa:council-failed', { reason: err?.message || 'unknown' })
        return {
            ok: false,
            error: 'dispatch_failed',
            message: err?.message || 'Council dispatch failed.',
            councilId,
        }
    }

    if (abortSignal?.aborted) {
        emit('moa:council-aborted', { reason: 'aborted' })
        return {
            ok: false,
            error: 'aborted',
            message: 'Council execution was aborted.',
            councilId,
        }
    }

    // 3. Collect agent outputs
    const results = Array.isArray(envelope?.agents)
        ? envelope.agents
        : (Array.isArray(envelope?.results) ? envelope.results : [])
    const agentOutputs = results.map((r, i) => ({
        roleName: cleanString(r.role || r.roleName || members[i]?.name),
        roleId: cleanString(r.roleId || members[i]?.id),
        modelLabel: `${cleanString(r.role || r.roleName || members[i]?.name)} (${cleanString(members[i]?.providerId)}/${cleanString(members[i]?.model)})`,
        output: cleanString(r.agentOutput || r.output),
        status: r.status || 'unknown',
    }))

    const successfulOutputs = agentOutputs.filter((o) => (
        o.output && cleanString(o.status).toLowerCase() === 'completed'
    ))
    if (successfulOutputs.length === 0) {
        emit('moa:council-failed', { reason: 'no_successful_outputs' })
        return {
            ok: false,
            error: 'no_results',
            message: 'All council members failed to produce output.',
            councilId,
            memberOutputs: agentOutputs,
        }
    }

    emit('moa:council-outputs-collected', {
        successCount: successfulOutputs.length,
        totalCount: agentOutputs.length,
    })

    // 4. Build synthesis data (synthesis itself happens in the chat via AI)
    const { systemPrompt, userPrompt } = buildSynthesisPrompts(successfulOutputs, {
        originalTask: instruction,
    })

    emit('moa:council-done', {
        councilId,
        memberCount: members.length,
        successCount: successfulOutputs.length,
    })

    return {
        ok: true,
        councilId,
        memberCount: members.length,
        memberOutputs: agentOutputs,
        successfulOutputs: successfulOutputs.length,
        synthesisPrompts: { systemPrompt, userPrompt },
        instruction,
        costEstimate: {
            estimatedTokens: costEstimate.estimatedTokens,
            estimatedUsd: costEstimate.estimatedUsd,
            usdAvailable: costEstimate.usdAvailable,
        },
    }
}

