function double(value) {
  return value * 2
}

export function summarizeItems(items = []) {
  return items.map((item, index) => ({
    index,
    label: String(item.label || '').trim(),
    score: double(Number(item.score || 0)),
  }))
}

console.log(summarizeItems([{ label: 'alpha', score: 2 }]))
