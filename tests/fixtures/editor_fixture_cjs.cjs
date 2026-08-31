const values = [1, 2, 3]

function total(items) {
  return items.reduce((sum, item) => sum + item, 0)
}

module.exports = {
  total,
  values,
}
