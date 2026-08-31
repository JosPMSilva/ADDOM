import React from 'react'

import { buildFixedSizeVirtualWindow } from '../../utils/fixed-size-virtual-window.mjs'
import { AGENT_NAVIGATOR_ROW_HEIGHT } from './AgentNavigatorRow.jsx'

const VIRTUAL_OVERSCAN = 6

/**
 * Windows one section against the shared scroll container. Each section keeps its own label in the
 * document flow, so heavy runs stay scannable instead of losing their Active/Done structure.
 */
export default function AgentNavigatorSection({
  label,
  rows,
  indexOffset,
  virtualize,
  scrollTop,
  viewportHeight,
  renderRow,
  emptyMessage,
}) {
  const listRef = React.useRef(null)
  const [sectionTop, setSectionTop] = React.useState(0)

  React.useEffect(() => {
    if (!virtualize) return
    const element = listRef.current
    if (element) setSectionTop(element.offsetTop)
  }, [virtualize, rows.length, scrollTop])

  const virtualWindow = virtualize
    ? buildFixedSizeVirtualWindow({
      itemCount: rows.length,
      itemHeight: AGENT_NAVIGATOR_ROW_HEIGHT,
      viewportHeight,
      scrollTop: scrollTop - sectionTop,
      overscan: VIRTUAL_OVERSCAN,
    })
    : null

  const visible = virtualWindow ? rows.slice(virtualWindow.startIndex, virtualWindow.endIndex) : rows
  const startIndex = virtualWindow ? virtualWindow.startIndex : 0

  return (
    <>
      <div
        className="px-2 pb-1 pt-3 font-display text-[10px] font-semibold uppercase tracking-wide text-text-tertiary"
        data-ui="agent-navigator-section-label"
      >
        {label}
      </div>
      {rows.length === 0 && emptyMessage ? (
        <p
          className="mx-1 rounded-md px-2 py-2 text-[11px] text-text-muted"
          data-ui="agent-navigator-empty-section"
        >
          {emptyMessage}
        </p>
      ) : null}
      <div
        ref={listRef}
        style={virtualWindow ? {
          paddingTop: virtualWindow.paddingTop,
          paddingBottom: virtualWindow.paddingBottom,
        } : undefined}
      >
        {visible.map((row, offset) => renderRow(row, indexOffset + startIndex + offset))}
      </div>
    </>
  )
}
