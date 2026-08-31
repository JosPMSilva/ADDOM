function buildChangeSummary(hunk = {}, labels = {}) {
  const lines = Array.isArray(hunk?.lines) ? hunk.lines : []
  const added = lines.filter((line) => line?.type === 'add').length
  const deleted = lines.filter((line) => line?.type === 'delete').length
  if (!added && !deleted) return String(labels?.noLineDelta || '').trim() || 'No line delta'
  return `+${added} -${deleted}`
}

function resolveGitWidgetLabels(labels = {}) {
  return {
    noLineDelta: String(labels?.noLineDelta || '').trim() || 'No line delta',
    stage: String(labels?.stage || '').trim() || 'Stage',
    staging: String(labels?.staging || '').trim() || 'Staging...',
    unstage: String(labels?.unstage || '').trim() || 'Unstage',
    unstaging: String(labels?.unstaging || '').trim() || 'Unstaging...',
    more: String(labels?.more || '').trim() || 'More',
    moreHunkActions: String(labels?.moreHunkActions || '').trim() || 'More hunk actions',
    discard: String(labels?.discard || '').trim() || 'Discard',
    discarding: String(labels?.discarding || '').trim() || 'Discarding...',
    close: String(labels?.close || '').trim() || 'Close',
    stageLines: String(labels?.stageLines || '').trim() || 'Stage Lines',
    unstageLines: String(labels?.unstageLines || '').trim() || 'Unstage Lines',
    discardLines: String(labels?.discardLines || '').trim() || 'Discard Lines',
    staged: String(labels?.staged || '').trim() || 'Staged',
    unstaged: String(labels?.unstaged || '').trim() || 'Unstaged',
    hunkPrefix: String(labels?.hunkPrefix || '').trim() || 'Hunk',
  }
}

const GIT_HUNK_WIDGET_FALLBACK_WIDTH_PX = 260
const GIT_HUNK_WIDGET_MINIMAP_GAP_PX = 12
const GIT_HUNK_WIDGET_CONTENT_GAP_PX = 16

function readHunkWidgetWidth(domNode) {
  const measuredWidth = Math.round(
    Number(domNode?.offsetWidth || domNode?.getBoundingClientRect?.()?.width || 0) || 0,
  )
  return measuredWidth > 0 ? measuredWidth : GIT_HUNK_WIDGET_FALLBACK_WIDTH_PX
}

function readHunkWidgetMarginLeft(editor, domNode) {
  const layoutInfo = editor?.getLayoutInfo?.()
  const contentLeft = Math.max(0, Number(layoutInfo?.contentLeft || 0) || 0)
  const contentWidth = Math.max(0, Number(layoutInfo?.contentWidth || 0) || 0)
  const minimapLeft = Math.max(0, Number(layoutInfo?.minimap?.minimapLeft || 0) || 0)
  const minimapWidth = Math.max(0, Number(layoutInfo?.minimap?.minimapWidth || 0) || 0)
  const widgetWidth = readHunkWidgetWidth(domNode)

  if (minimapLeft > contentLeft && minimapWidth > 0) {
    const targetLeft = minimapLeft - GIT_HUNK_WIDGET_MINIMAP_GAP_PX - widgetWidth
    return `${Math.max(0, Math.round(targetLeft - contentLeft))}px`
  }

  return contentWidth > 0
    ? `${Math.max(0, contentWidth - widgetWidth - GIT_HUNK_WIDGET_CONTENT_GAP_PX)}px`
    : '0'
}

export function createMonacoGitHunkWidget({
  editor,
  monaco,
  onStageHunk,
  onDiscardHunk,
  onUnstageHunk,
  onStageLines,
  onDiscardLines,
  onUnstageLines,
  onClose,
  labels = {},
} = {}) {
  const resolvedLabels = resolveGitWidgetLabels(labels)
  const domNode = document.createElement('div')
  domNode.className = 'addom-git-hunk-widget'
  domNode.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  domNode.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMoreMenuOpen(false)
  })

  const topBar = document.createElement('div')
  topBar.className = 'addom-git-hunk-widget__topbar'
  domNode.appendChild(topBar)

  const metaNode = document.createElement('div')
  metaNode.className = 'addom-git-hunk-widget__meta'
  topBar.appendChild(metaNode)

  const scopeNode = document.createElement('div')
  scopeNode.className = 'addom-git-hunk-widget__scope'
  metaNode.appendChild(scopeNode)

  const headerNode = document.createElement('div')
  headerNode.className = 'addom-git-hunk-widget__header'
  metaNode.appendChild(headerNode)

  const actionRow = document.createElement('div')
  actionRow.className = 'addom-git-hunk-widget__actions addom-git-hunk-widget__actions-primary'
  topBar.appendChild(actionRow)

  const stageButton = document.createElement('button')
  stageButton.type = 'button'
  stageButton.className = 'btn btn-secondary addom-git-hunk-widget__button'
  stageButton.textContent = resolvedLabels.stage
  actionRow.appendChild(stageButton)

  const moreButton = document.createElement('button')
  moreButton.type = 'button'
  moreButton.className = 'btn btn-secondary addom-git-hunk-widget__button addom-git-hunk-widget__more-button'
  moreButton.textContent = resolvedLabels.more
  moreButton.setAttribute('aria-haspopup', 'menu')
  moreButton.setAttribute('aria-expanded', 'false')
  moreButton.setAttribute('aria-label', resolvedLabels.moreHunkActions)
  actionRow.appendChild(moreButton)

  const moreMenu = document.createElement('div')
  moreMenu.className = 'addom-git-hunk-widget__menu'
  moreMenu.setAttribute('role', 'menu')
  moreMenu.style.display = 'none'
  domNode.appendChild(moreMenu)

  const discardButton = document.createElement('button')
  discardButton.type = 'button'
  discardButton.className = 'addom-git-hunk-widget__menu-button addom-git-hunk-widget__menu-button-danger'
  discardButton.setAttribute('role', 'menuitem')
  discardButton.textContent = resolvedLabels.discard
  moreMenu.appendChild(discardButton)

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'addom-git-hunk-widget__menu-button'
  closeButton.setAttribute('role', 'menuitem')
  closeButton.textContent = resolvedLabels.close
  moreMenu.appendChild(closeButton)

  const lineActionMetaNode = document.createElement('div')
  lineActionMetaNode.className = 'addom-git-hunk-widget__line-meta'
  lineActionMetaNode.style.display = 'none'
  domNode.appendChild(lineActionMetaNode)

  const lineActionRow = document.createElement('div')
  lineActionRow.className = 'addom-git-hunk-widget__actions'
  lineActionRow.style.display = 'none'
  domNode.appendChild(lineActionRow)

  const stageLinesButton = document.createElement('button')
  stageLinesButton.type = 'button'
  stageLinesButton.className = 'btn btn-secondary addom-git-hunk-widget__button'
  stageLinesButton.textContent = resolvedLabels.stageLines
  lineActionRow.appendChild(stageLinesButton)

  const discardLinesButton = document.createElement('button')
  discardLinesButton.type = 'button'
  discardLinesButton.className = 'addom-git-hunk-widget__menu-button addom-git-hunk-widget__menu-button-danger'
  discardLinesButton.setAttribute('role', 'menuitem')
  discardLinesButton.textContent = resolvedLabels.discardLines
  moreMenu.insertBefore(discardLinesButton, discardButton)

  const errorNode = document.createElement('div')
  errorNode.className = 'addom-git-hunk-widget__error'
  domNode.appendChild(errorNode)

  let attached = false
  let anchorLineNumber = 1
  let currentHunkId = ''
  let currentLineAction = null
  let currentScope = 'unstaged'
  let moreMenuOpen = false
  const ownerWindow = domNode.ownerDocument?.defaultView || null
  const ResizeObserverImpl = ownerWindow?.ResizeObserver || globalThis.ResizeObserver || null

  function setMoreMenuOpen(open) {
    moreMenuOpen = !!open
    moreMenu.style.display = moreMenuOpen ? 'block' : 'none'
    moreButton.setAttribute('aria-expanded', moreMenuOpen ? 'true' : 'false')
  }

  const handleWindowPointerDown = (event) => {
    if (moreMenuOpen && !domNode.contains(event.target)) {
      setMoreMenuOpen(false)
    }
  }
  ownerWindow?.addEventListener?.('pointerdown', handleWindowPointerDown)

  const widget = {
    allowEditorOverflow: true,
    getId() {
      return 'addom.editor.git.hunk.widget'
    },
    getDomNode() {
      return domNode
    },
    getPosition() {
      if (!attached) return null
      domNode.style.marginLeft = readHunkWidgetMarginLeft(editor, domNode)
      return {
        position: { lineNumber: anchorLineNumber, column: 1 },
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW],
      }
    },
  }
  const resizeObserver = ResizeObserverImpl
    ? new ResizeObserverImpl(() => {
        if (attached) {
          editor.layoutContentWidget(widget)
        }
      })
    : null
  resizeObserver?.observe(domNode)

  function syncActionState(uiState = {}) {
    const actionHunkId = String(uiState?.actionHunkId || '').trim()
    const actionType = String(uiState?.actionType || '').trim()
    const isStageLoading = actionHunkId && actionHunkId === currentHunkId && actionType === 'stage'
    const isDiscardLoading = actionHunkId && actionHunkId === currentHunkId && actionType === 'discard'
    const isStageLinesLoading = actionHunkId && actionHunkId === currentHunkId && actionType === 'stage_lines'
    const isDiscardLinesLoading = actionHunkId && actionHunkId === currentHunkId && actionType === 'discard_lines'
    const isUnstageLoading = actionHunkId && actionHunkId === currentHunkId && actionType === 'unstage'
    const isUnstageLinesLoading = actionHunkId && actionHunkId === currentHunkId && actionType === 'unstage_lines'
    const scope = String(uiState?.scope || 'unstaged').trim().toLowerCase() === 'staged' ? 'staged' : 'unstaged'
    currentScope = scope
    const isStagedScope = scope === 'staged'
    const disableHunkButtons = isStageLoading || isDiscardLoading || isUnstageLoading

    stageButton.disabled = disableHunkButtons
    discardButton.disabled = disableHunkButtons || isStagedScope
    stageButton.textContent = isStagedScope
      ? (isUnstageLoading ? resolvedLabels.unstaging : resolvedLabels.unstage)
      : (isStageLoading ? resolvedLabels.staging : resolvedLabels.stage)
    discardButton.textContent = isDiscardLoading ? resolvedLabels.discarding : resolvedLabels.discard
    discardButton.style.display = isStagedScope ? 'none' : ''
    scopeNode.textContent = isStagedScope ? resolvedLabels.staged : resolvedLabels.unstaged

    const lineAction = uiState?.lineAction || null
    const lineActionMessage = String(lineAction?.message || '').trim()
    const lineActionsEnabled = !!lineAction?.enabled
    currentLineAction = lineActionsEnabled ? lineAction : null
    lineActionMetaNode.textContent = lineActionMessage
    lineActionMetaNode.style.display = lineActionMessage ? 'block' : 'none'
    lineActionRow.style.display = lineActionsEnabled ? 'flex' : 'none'
    stageLinesButton.disabled = !lineActionsEnabled || isStageLinesLoading || isUnstageLinesLoading
    discardLinesButton.disabled = !lineActionsEnabled || isDiscardLinesLoading
    stageLinesButton.textContent = isStagedScope
      ? (isUnstageLinesLoading ? resolvedLabels.unstaging : resolvedLabels.unstageLines)
      : (isStageLinesLoading ? resolvedLabels.staging : resolvedLabels.stageLines)
    discardLinesButton.textContent = isDiscardLinesLoading ? resolvedLabels.discarding : resolvedLabels.discardLines
    discardLinesButton.style.display = lineActionsEnabled && !isStagedScope ? '' : 'none'

    const errorText = String(uiState?.actionError || '').trim()
    errorNode.textContent = errorText
    errorNode.style.display = errorText ? 'block' : 'none'
  }

  moreButton.addEventListener('click', () => {
    setMoreMenuOpen(!moreMenuOpen)
  })
  stageButton.addEventListener('click', () => {
    setMoreMenuOpen(false)
    if (!currentHunkId) return
    if (currentScope === 'staged') {
      onUnstageHunk?.(currentHunkId)
      return
    }
    onStageHunk?.(currentHunkId)
  })
  discardButton.addEventListener('click', () => {
    setMoreMenuOpen(false)
    if (!currentHunkId) return
    onDiscardHunk?.(currentHunkId)
  })
  closeButton.addEventListener('click', () => {
    setMoreMenuOpen(false)
    onClose?.()
  })
  stageLinesButton.addEventListener('click', () => {
    setMoreMenuOpen(false)
    if (!currentHunkId || !currentLineAction?.enabled) return
    const payload = {
      hunkId: currentHunkId,
      startLine: currentLineAction.startLine,
      endLine: currentLineAction.endLine,
    }
    if (currentScope === 'staged') {
      onUnstageLines?.(payload)
      return
    }
    onStageLines?.(payload)
  })
  discardLinesButton.addEventListener('click', () => {
    setMoreMenuOpen(false)
    if (!currentHunkId || !currentLineAction?.enabled) return
    onDiscardLines?.({
      hunkId: currentHunkId,
      startLine: currentLineAction.startLine,
      endLine: currentLineAction.endLine,
    })
  })

  return {
    show({ hunk, lineNumber, uiState = {} } = {}) {
      if (!hunk?.id) return
      currentHunkId = hunk.id
      anchorLineNumber = Math.max(1, Number(lineNumber || 1) || 1)
      headerNode.textContent = `${resolvedLabels.hunkPrefix} ${buildChangeSummary(hunk, resolvedLabels)}`
      syncActionState(uiState)
      if (!attached) {
        editor.addContentWidget(widget)
        attached = true
      } else {
        editor.layoutContentWidget(widget)
      }
    },
    hide() {
      currentHunkId = ''
      currentLineAction = null
      currentScope = 'unstaged'
      setMoreMenuOpen(false)
      if (!attached) return
      editor.removeContentWidget(widget)
      attached = false
    },
    dispose() {
      resizeObserver?.disconnect()
      ownerWindow?.removeEventListener?.('pointerdown', handleWindowPointerDown)
      this.hide()
    },
  }
}
