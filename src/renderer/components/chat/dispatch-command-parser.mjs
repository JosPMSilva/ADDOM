/**
 * dispatch-command-parser.mjs
 *
 * Detects and parses `/dispatch <description>` commands from the chat composer.
 * Example: "/dispatch Review the auth module for security, performance, and accessibility"
 *
 * Uses `/dispatch` (slash command) to trigger automatic task decomposition
 * and parallel fan-out across matching MoA agent roles.
 */

const DISPATCH_COMMAND_RE = /^\/dispatch\s+(.+)/is

/**
 * @param {string} text – raw composer text
 * @returns {boolean}
 */
export function isDispatchCommand(text) {
    return DISPATCH_COMMAND_RE.test(String(text || '').trim())
}

/**
 * @param {string} text – raw composer text
 * @returns {{ description: string } | null}
 */
export function parseDispatchCommand(text) {
    const match = String(text || '').trim().match(DISPATCH_COMMAND_RE)
    if (!match) return null
    const description = match[1].trim()
    if (!description) return null
    return { description }
}
