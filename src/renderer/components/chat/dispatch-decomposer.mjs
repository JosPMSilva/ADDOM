import { resolveMoaRoleKey } from '../../../common/moa/moa-role-keys.mjs'

/**
 * dispatch-decomposer.mjs
 *
 * Builds AI prompts for task decomposition.
 * Given a user's high-level task and the list of available MoA roles,
 * produces system/user prompts that instruct the AI to decompose the
 * task into parallel sub-tasks matched to available roles.
 *
 * The AI's JSON response is then used to create a direct agent dispatch.
 */

/**
 * Build prompts for the decomposition AI call.
 *
 * @param {string} description - The user's high-level task description
 * @param {{ moaRoles?: Array, projectFolder?: string }} context
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildDispatchDecompositionPrompts(description, context = {}) {
  const roles = Array.isArray(context.moaRoles) ? context.moaRoles : []

  const roleList = roles.length > 0
    ? roles.map((role) => `- key="${resolveMoaRoleKey(role)}" | name="${role.name}" - ${(role.systemPrompt || '').slice(0, 120).replace(/\n/g, ' ')}...`).join('\n')
    : '(no agent roles configured - you should still decompose the task)'

  const systemPrompt = `You are a task decomposition engine for the ADDOM MoA (Mixture-of-Agents) system.

Your task: given a user's high-level task description, decompose it into parallel sub-tasks and match each to the most appropriate available agent role.

Output ONLY valid JSON with this exact schema (no markdown, no explanation, just the JSON object):
{
  "tasks": [
    {
      "agent_role_key": "<short key of the matching configured role, must match exactly>",
      "agent_role": "<display name of the matching role>",
      "instruction": "<specific, actionable instruction for this agent, 50-200 words>",
      "expected_output_format": "<what format the agent should produce>"
    }
  ],
  "summary": "<one-line summary of the decomposition>"
}

Rules:
- Match sub-tasks ONLY to roles from the available roles list below
- When explicitly pinning a configured role, prefer agent_role_key
- Do not invent role keys or role names
- The available role list is authoritative for configured delegation. Use only listed keys.
- Each sub-task instruction should be specific and self-contained
- Include enough context in the instruction for the agent to act independently
- If the task naturally maps to just 1 role, return just 1 task - do not force decomposition
- Maximum 6 sub-tasks (even if more roles are available)
- If no role is a good match for part of the task, skip that part and mention it in the summary
- If no configured role fits but a new specialized role would help, do not invent a configured role key; leave the work undelegated and mention that a runtime role proposal may be needed in the summary
- Never invent a configured role key. Use only roles present in the current catalog.
- Order tasks by priority (most important first)
- Each instruction must start with a clear action verb (Review, Analyze, Audit, Check, etc.)
- Always respond in the same language as the task description

Available agent roles:
${roleList}`

  const userPrompt = `Decompose this task into parallel sub-tasks for the available agent roles:\n\n${description}`

  return { systemPrompt, userPrompt }
}
