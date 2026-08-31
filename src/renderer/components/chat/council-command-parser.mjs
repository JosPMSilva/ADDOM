/**
 * council-command-parser.mjs
 *
 * Detects and parses `/council <instruction>` commands from the chat composer.
 * Example: "/council Review the auth module for security vulnerabilities"
 *
 * Sends the same task to all configured MoA roles in parallel,
 * then synthesizes their outputs into a consensus report.
 */

const COUNCIL_COMMAND_RE = /^\/council\s+(.+)/is

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isCouncilCommand(text) {
    return COUNCIL_COMMAND_RE.test(String(text || '').trim())
}

/**
 * @param {string} text
 * @returns {{ instruction: string } | null}
 */
export function parseCouncilCommand(text) {
    const match = String(text || '').trim().match(COUNCIL_COMMAND_RE)
    if (!match) return null
    const instruction = match[1].trim()
    if (!instruction) return null
    return { instruction }
}
