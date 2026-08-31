/**
 * composer-highlight.mjs
 *
 * Shared syntax-highlighting helpers used by both CodeSnippetBlock (read-only
 * rendered output) and the ChatComposer code-block editor (live textarea overlay).
 *
 * Keeps hljs import in one place so the bundle only loads it once.
 */
import hljs from 'highlight.js/lib/common'

/**
 * Returns true when hljs knows the given language alias.
 * Always returns false for falsy / 'plaintext' values so callers can skip the
 * highlight pass cheaply.
 */
export function canHighlightLanguage(language) {
  const lang = String(language || '').trim().toLowerCase()
  if (!lang || lang === 'plaintext' || lang === 'text') return false
  return Boolean(hljs.getLanguage(lang))
}

/**
 * Returns an hljs-highlighted HTML string for `content` in `language`.
 * Falls back to auto-detect when the language is unknown.
 * Returns an empty string on any error or when content is empty.
 *
 * @param {string} content  Raw source code text.
 * @param {string} language Language alias (e.g. 'python', 'js', 'ts').
 * @returns {string} HTML string safe to set via dangerouslySetInnerHTML.
 */
export function highlightCode(content, language) {
  const text = String(content ?? '')
  if (!text) return ''
  const preferred = String(language || '').trim().toLowerCase()
  try {
    if (preferred && hljs.getLanguage(preferred)) {
      return hljs.highlight(text, { language: preferred, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(text).value
  } catch {
    return ''
  }
}
