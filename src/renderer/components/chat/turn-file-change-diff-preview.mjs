import { computeLineDiff, flattenLineDiffSegmentsToPreviewRows } from '../diff/line-diff.mjs'

export function buildSharedDiffPreviewRows(beforeText, afterText, maxRows = null) {
  return flattenLineDiffSegmentsToPreviewRows(
    computeLineDiff(beforeText, afterText),
    {
      ...(Number.isFinite(Number(maxRows)) && Number(maxRows) > 0 ? { maxRows } : {}),
      truncateMessage: 'Diff preview truncated.',
    },
  )
}
