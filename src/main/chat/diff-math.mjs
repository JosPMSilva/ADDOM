export function splitContentLines(content = '') {
  const normalized = String(content ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (normalized === '') return []

  const lines = normalized.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

export function countLineDelta(prevContent = '', nextContent = '') {
  const before = String(prevContent ?? '')
  const after = String(nextContent ?? '')
  if (!before && !after) return { addedLines: 0, removedLines: 0 }

  const a = splitContentLines(before)
  const b = splitContentLines(after)
  const maxCells = 1_200_000
  const cells = (a.length + 1) * (b.length + 1)

  if (cells > maxCells) {
    const rawDelta = b.length - a.length
    return {
      addedLines: rawDelta > 0 ? rawDelta : 0,
      removedLines: rawDelta < 0 ? Math.abs(rawDelta) : 0,
    }
  }

  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }
  const lcs = Number(dp[0][0] || 0)
  return {
    addedLines: Math.max(0, b.length - lcs),
    removedLines: Math.max(0, a.length - lcs),
  }
}
