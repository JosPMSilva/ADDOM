/**
 * prompt-enhancer.mjs
 *
 * Enriches agent task instructions with project context before dispatch.
 * Uses project-context-builder.mjs to gather tech stack, file tree,
 * and relevant file information, then prepends it to the task's
 * injected_context.
 *
 * Also injects agent memory (prior session context) when enabled.
 *
 * This is a lightweight, zero-LLM-call approach — it enriches
 * the context deterministically without spending extra API tokens.
 */

import { buildProjectContext } from './project-context-builder.mjs'
import { buildMemoryContext } from './agent-memory.mjs'

const MAX_CONTEXT_CHARS = 3000

/**
 * Enhance a delegation task with project context and agent memory.
 *
 * @param {object} task
 * @param {object} options
 * @param {string} options.projectFolder
 * @param {boolean} options.enabled - Whether project context enhancement is enabled
 * @param {boolean} options.memoryEnabled - Whether agent memory injection is enabled
 * @returns {object}
 */
export function enhanceTaskContext(task, { projectFolder = '', enabled = false, memoryEnabled = false } = {}) {
    if (!projectFolder || !task) return task
    if (!enabled && !memoryEnabled) return task

    const instruction = String(task.instruction ?? '').trim()
    if (!instruction) return task

    let enhanced = { ...task }

    // 1. Project context enhancement
    if (enabled) {
        try {
            const projectContext = buildProjectContext(projectFolder, instruction)
            if (projectContext) {
                const truncated = projectContext.length > MAX_CONTEXT_CHARS
                    ? projectContext.slice(0, MAX_CONTEXT_CHARS) + '\n... (project context truncated)'
                    : projectContext

                const existingContext = String(enhanced.injected_context ?? '').trim()
                const separator = existingContext
                    ? '\n\n--- Project Context (auto-enriched) ---\n'
                    : '--- Project Context (auto-enriched) ---\n'

                enhanced.injected_context = existingContext
                    ? `${existingContext}${separator}${truncated}`
                    : `${separator}${truncated}`
            }
        } catch (err) {
            console.warn('[prompt-enhancer] project context failed:', err?.message || err)
        }
    }

    // 2. Agent memory injection
    if (memoryEnabled) {
        try {
            const memory = buildMemoryContext(projectFolder, {
                roleId: String(enhanced.agent_role_id || '').trim(),
                roleName: String(enhanced.agent_role || '').trim(),
                specialty: String(enhanced.specialty || '').trim(),
                taskType: String(enhanced.task_type || enhanced.taskType || '').trim(),
                templateId: String(enhanced.templateId || '').trim(),
                templateLabel: String(enhanced.templateLabel || '').trim(),
                ancestry: enhanced.ancestry && typeof enhanced.ancestry === 'object'
                    ? enhanced.ancestry
                    : null,
            }, { maxEntries: 5, maxChars: 1500 })
            if (memory) {
                const ctx = String(enhanced.injected_context ?? '').trim()
                enhanced.injected_context = ctx
                    ? `${ctx}\n\n${memory}`
                    : memory
            }
        } catch (err) {
            console.warn('[prompt-enhancer] memory injection failed:', err?.message || err)
        }
    }

    return enhanced
}

/**
 * Enhance an array of delegation tasks.
 *
 * @param {Array<object>} tasks
 * @param {object} options
 * @param {string} options.projectFolder
 * @param {boolean} options.enabled
 * @param {boolean} options.memoryEnabled
 * @returns {Array<object>}
 */
export function enhanceAllTasks(tasks, options = {}) {
    if (!Array.isArray(tasks)) return tasks
    if (!options.enabled && !options.memoryEnabled) return tasks
    return tasks.map((task) => enhanceTaskContext(task, options))
}

