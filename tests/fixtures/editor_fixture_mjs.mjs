export const fixtureRows = [
  { name: 'alpha', value: 1 },
  { name: 'beta', value: 2 },
]

export function names() {
  return fixtureRows.map((row) => row.name)
}
