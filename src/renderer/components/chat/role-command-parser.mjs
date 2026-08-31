import { providerHasCredential } from '../../../common/api-clients/provider-credential-state.mjs'

/**
 * role-command-parser.mjs
 *
 * Detects and parses `/createrole <description>` commands from the chat composer.
 * Example: "/createrole UI/UX Agent for Web development"
 *
 * Uses `/createrole` (slash command) to clearly indicate role creation
 * and avoid collision with the existing `@mention` direct agent system.
 */

const ROLE_COMMAND_RE = /^\/createrole\s+(.+)/is
const COMPOSITE_ROLE_COMMAND_PATTERNS = Object.freeze([
    /^(?<task>[\s\S]+?)\b(?:and|then|after that|also)\s+(?:please\s+)?(?:create|generate|propose|suggest)\s+(?:me\s+|us\s+)?(?:a|an)?\s*(?:new\s+)?(?:(?:moa|agentic)\s+)?(?:(?:agent\s+)?role|agent)\b(?<rest>[\s\S]*)$/i,
    /^(?<task>[\s\S]+?)\b(?:and|then|after that|also)\s+(?:please\s+)?make\s+yourself\s+(?:a|an)?\s*(?<rest>[\s\S]*?\b(?:role|agent)\b[\s\S]*)$/i,
])
const NATURAL_LANGUAGE_ROLE_PATTERNS = Object.freeze([
    /^(?:please\s+)?(?:create|generate|propose|suggest)\s+(?:me\s+|us\s+)?(?:a|an)?\s*(?:new\s+)?(?:(?:moa|agentic)\s+)?(?:(?:agent\s+)?role|agent)\b([\s\S]*)$/i,
    /^(?:please\s+)?make\s+yourself\s+(?:a|an)?\s*([\s\S]*?\b(?:role|agent))\b([\s\S]*)$/i,
    /^(?:please\s+)?(?:we|i|you)\s+(?:need|want)\s+(?:a|an)?\s*([\s\S]*?\b(?:role|agent))\b([\s\S]*)$/i,
])
const GENERIC_ROLE_DESCRIPTION_RE = /^(?:help\s+(?:you|me|us)\s+with\s+(?:this|the)\s+task|this\s+task|that\s+task|the\s+task|for\s+this|for\s+that|help\s+with\s+this|help\s+with\s+that)$/i

function cleanText(value) {
    return String(value || '').trim()
}

function normalizeNaturalLanguageRoleDescription(text = '') {
    const remainder = cleanText(text)
    if (!remainder) return ''
    return remainder
        .replace(/^(?:for|to|that|which)\b[:\s-]*/i, '')
        .trim()
}

function isGenericRoleDescription(text = '') {
    return GENERIC_ROLE_DESCRIPTION_RE.test(cleanText(text))
}

function matchCompositeRoleCommand(input = '') {
    const text = cleanText(input)
    for (const pattern of COMPOSITE_ROLE_COMMAND_PATTERNS) {
        const match = text.match(pattern)
        if (!match?.groups) continue
        const task = cleanText(match.groups.task)
        const rest = normalizeNaturalLanguageRoleDescription(match.groups.rest)
        const description = (!rest || isGenericRoleDescription(rest))
            ? task
            : `${task} ${rest}`.trim()
        if (!description) continue
        return {
            description,
            source: 'composite_natural_language',
        }
    }
    return null
}

function matchNaturalLanguageRoleCommand(input = '') {
    const text = cleanText(input)
    const compositeMatch = matchCompositeRoleCommand(text)
    if (compositeMatch) return compositeMatch
    for (const pattern of NATURAL_LANGUAGE_ROLE_PATTERNS) {
        const match = text.match(pattern)
        if (!match) continue
        const remainder = match.slice(1).map((part) => cleanText(part)).filter(Boolean).join(' ').trim()
        return {
            description: normalizeNaturalLanguageRoleDescription(remainder) || text,
            source: 'natural_language',
        }
    }
    return null
}

/**
 * @param {string} text - raw composer text
 * @returns {boolean}
 */
export function isRoleCommand(text) {
    const input = cleanText(text)
    return ROLE_COMMAND_RE.test(input) || !!matchNaturalLanguageRoleCommand(input)
}

/**
 * @param {string} text - raw composer text
 * @returns {{ description: string } | null}
 */
export function parseRoleCommand(text) {
    const input = cleanText(text)
    const slashMatch = input.match(ROLE_COMMAND_RE)
    if (slashMatch) {
        const description = cleanText(slashMatch[1])
        if (!description) return null
        return { description, source: 'slash' }
    }

    return matchNaturalLanguageRoleCommand(input)
}

/**
 * Build a structured prompt that asks the current model to generate an agent
 * role definition given a free-text description.
 *
 * @param {string} description - e.g. "UI/UX Agent for Web development"
 * @param {{ providers?: Array, selectedProvider?: string, selectedModel?: string }} context
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
export function buildRoleGenerationPrompts(description, context = {}) {
    const providers = Array.isArray(context.providers) ? context.providers : []
    const selectedProviderId = cleanText(context.selectedProvider)
    const selectedModelId = cleanText(context.selectedModel)
    const configuredProviders = providers
        .filter((provider) => providerHasCredential(provider))
        .map((p) => ({
            id: p.id,
            name: p.name,
            models: (p.models || []).map((m) => m.id || m.label).slice(0, 10),
        }))
    const effectiveProviders = configuredProviders.length > 0
        ? configuredProviders
        : (selectedProviderId && selectedModelId
            ? [{
                id: selectedProviderId,
                name: selectedProviderId,
                models: [selectedModelId],
            }]
            : [])

    const providerList = effectiveProviders.length > 0
        ? effectiveProviders.map((p) => `- ${p.name} (${p.id}): models=[${p.models.join(', ')}]`).join('\n')
        : '(no providers available)'

    const systemPrompt = `You are a role definition generator for the ADDOM MoA (Mixture-of-Agents) system.
Your task: given a user's natural-language description of a desired AI agent role, generate a structured role definition.

Output ONLY valid JSON with this exact schema (no markdown, no explanation, just the JSON object):
{
  "name": "<concise role name, 3-5 words max>",
  "systemPrompt": "<system prompt instructions for this agent role, 100-500 words, action-oriented, specific>",
  "suggestedProviderId": "<provider id from the list below, pick the best fit>",
  "suggestedModel": "<model id from the provider's model list>"
}

Rules for the systemPrompt field:
- Write it as direct instructions to an AI agent (second person: "You are...", "Your task is...")
- Be specific about the agent's expertise, responsibilities, and output format
- Include domain-specific guidance relevant to the role
- Keep it focused and actionable (no filler or generic advice)
- Maximum 2000 characters
- Never ask clarifying questions, never request more detail, and never say the request is too vague.
- If the request is underspecified, infer the most useful broadly applicable role from the current request and thread context.
- If the context is still sparse, choose a pragmatic general-purpose software engineering or code-analysis role instead of refusing.
- CRITICAL: The systemPrompt MUST include an explicit instruction telling the agent to use its available tools (read_file, list_directory, search_code) to investigate the codebase BEFORE producing any analysis or recommendations. Agents that do not use tools will produce shallow, unhelpful results.
- Include a line like: "Always use your tools - start with list_directory to understand the project structure, then read_file to inspect relevant files, and search_code to find patterns. Never produce conclusions without reading actual source code first."
- Do NOT write overly prescriptive step-by-step output formats that could cause the agent to skip tool usage and jump to producing formatted text
- Never propose saving a file, registering a JSON file, provisioning a role manually, or taking the next step outside the in-app role card flow.
- Never mention previous roles, existing saved roles, or whether a similar role already exists.
- Output the JSON object only. No prose before it, no prose after it, no markdown fences.

Available providers and models:
${providerList}

Current user selection: ${selectedProviderId || 'none'}/${selectedModelId || 'none'}
Prefer the user's current provider/model unless the role clearly needs a different model (e.g. vision tasks need a vision-capable model).`

    const userPrompt = `Create an agent role for: ${description}`

    return { systemPrompt, userPrompt }
}
