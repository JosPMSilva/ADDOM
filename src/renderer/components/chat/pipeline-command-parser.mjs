/**
 * pipeline-command-parser.mjs
 *
 * Detects and parses `/pipeline` commands from the chat composer.
 * Supports two subcommands:
 *   "/pipeline list"                        → list available pipelines
 *   "/pipeline <name> [context]"            → execute a pipeline
 *
 * Examples:
 *   "/pipeline list"
 *   "/pipeline review-fix-test Review the auth module"
 *   "/pipeline debug-fix Fix the login timeout issue"
 *   "/pipeline analyze-document Analyze the MoA architecture"
 */

const PIPELINE_LIST_RE = /^\/pipeline\s+list\s*$/is
const PIPELINE_EXECUTE_RE = /^\/pipeline\s+(\S+)(?:\s+(.+))?$/is

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isPipelineCommand(text) {
    const trimmed = String(text || '').trim()
    return PIPELINE_LIST_RE.test(trimmed) || PIPELINE_EXECUTE_RE.test(trimmed)
}

/**
 * @param {string} text
 * @returns {{ action: 'list' } | { action: 'execute', pipelineId: string, context: string } | null}
 */
export function parsePipelineCommand(text) {
    const trimmed = String(text || '').trim()

    if (PIPELINE_LIST_RE.test(trimmed)) {
        return { action: 'list' }
    }

    const match = trimmed.match(PIPELINE_EXECUTE_RE)
    if (!match) return null
    const pipelineId = match[1].trim()
    if (!pipelineId || pipelineId.toLowerCase() === 'list') return null
    return {
        action: 'execute',
        pipelineId,
        context: (match[2] || '').trim(),
    }
}
