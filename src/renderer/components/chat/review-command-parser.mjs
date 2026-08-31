/**
 * review-command-parser.mjs
 *
 * Detects and parses `/review [focus area]` commands from the chat composer.
 * Examples:
 *   "/review" (reviews entire project)
 *   "/review auth module security" (focused review)
 *   "/review performance of the rendering pipeline"
 *
 * Triggers the built-in "Comprehensive Code Review" pipeline.
 */

const REVIEW_COMMAND_RE = /^\/review(?:\s+(.+))?$/is

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isReviewCommand(text) {
    return REVIEW_COMMAND_RE.test(String(text || '').trim())
}

/**
 * @param {string} text
 * @returns {{ focus: string } | null}
 */
export function parseReviewCommand(text) {
    const match = String(text || '').trim().match(REVIEW_COMMAND_RE)
    if (!match) return null
    return {
        focus: (match[1] || '').trim(),
    }
}
