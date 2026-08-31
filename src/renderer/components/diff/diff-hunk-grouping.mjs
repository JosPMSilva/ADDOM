export const DIFF_HUNK_BACKGROUND = Object.freeze({
  added: 'bg-success-bg/55',
  removed: 'bg-danger-bg/55',
})

/** Continuous left-edge rail for a consecutive add/remove hunk. */
export const DIFF_HUNK_RAIL = Object.freeze({
  added: 'border-l-2 border-success',
  removed: 'border-l-2 border-danger',
})

/** Thin middle grid track for per-line change rails (when no hunk rail). */
export const DIFF_LINE_RAIL_TRACK = '0.125rem'

/**
 * Group consecutive added/removed rows so callers can paint one hunk band
 * instead of striping each line.
 */
export function groupConsecutiveDiffHunks(rows = []) {
  const groups = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const type = String(row?.type || '').trim()
    const mergeable = type === 'added' || type === 'removed'
    const last = groups[groups.length - 1]
    if (mergeable && last?.hunkType === type) {
      last.entries.push(row)
      continue
    }
    groups.push({
      key: mergeable ? `hunk:${type}:${row?.key || groups.length}` : String(row?.key || `row:${groups.length}`),
      hunkType: mergeable ? type : null,
      entries: [row],
    })
  }
  return groups
}
