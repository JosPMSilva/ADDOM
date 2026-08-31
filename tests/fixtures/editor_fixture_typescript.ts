type MetricRow = {
  name: string
  value: number
}

function average(rows: MetricRow[]): number {
  if (rows.length === 0) return 0
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return total / rows.length
}

export const fixtureRows: MetricRow[] = [
  { name: 'open_file', value: 12 },
  { name: 'switch_tab', value: 4 },
]

export const fixtureAverage = average(fixtureRows)
