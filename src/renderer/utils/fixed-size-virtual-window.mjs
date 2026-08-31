export function buildFixedSizeVirtualWindow({
  itemCount = 0,
  itemHeight = 0,
  viewportHeight = 0,
  scrollTop = 0,
  overscan = 0,
} = {}) {
  const count = Math.max(0, Number(itemCount) || 0)
  const height = Math.max(1, Number(itemHeight) || 1)
  const viewport = Math.max(0, Number(viewportHeight) || 0)
  const scroll = Math.max(0, Number(scrollTop) || 0)
  const extra = Math.max(0, Math.floor(Number(overscan) || 0))

  if (count === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    }
  }

  const visibleCount = Math.max(1, Math.ceil(viewport / height))
  const startIndex = Math.max(0, Math.floor(scroll / height) - extra)
  const endIndex = Math.min(count, startIndex + visibleCount + (extra * 2))
  const paddingTop = startIndex * height
  const totalHeight = count * height
  const paddingBottom = Math.max(0, totalHeight - (endIndex * height))

  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    totalHeight,
  }
}
