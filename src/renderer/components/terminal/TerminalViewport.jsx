import React from 'react'
import { requestAppConfirm } from '../../store/useAppStore.js'
import {
  TERMINAL_FONT_SIZE_DEFAULT,
  clampTerminalFontSize,
  createDefaultXtermViewportController,
  isTerminalInteractive,
  resolveRendererPlatform,
} from './use-xterm-viewport.js'
import TerminalContextMenu from './TerminalContextMenu.jsx'
import TerminalSearchBar from './TerminalSearchBar.jsx'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import useAppStore from '../../store/useAppStore.js'
import useSettingsStore from '../../store/useSettingsStore.js'
import {
  openExternalTerminalUrl,
  openTerminalWorkspaceFileReference,
} from './terminal-link-actions.mjs'
import {
  getPathTail,
} from './terminal-session-display.mjs'
import {
  TERMINAL_KEY_ACTIONS,
  getTerminalShortcutLabels,
  resolveTerminalKeyAction,
} from './terminal-keymap.mjs'
import { getTerminalViewportLabels } from './terminal-viewport-labels.mjs'
import {
  TERMINAL_CHAT_OUTPUT_MAX_CHARS,
  TERMINAL_ERROR_OUTPUT_MAX_CHARS,
  TERMINAL_MEMORY_OUTPUT_MAX_CHARS,
  TERMINAL_SUMMARY_OUTPUT_MAX_CHARS,
  extractTerminalOutputContext,
} from './terminal-output-context.mjs'
import { useTerminalOutputActions } from './use-terminal-output-actions.mjs'
import {
  DEFAULT_TERMINAL_SETTINGS,
  normalizeTerminalSettings,
} from '../../../common/terminal/terminal-settings.mjs'

function isArchivedTerminalSession(session = null) {
  return session?.archived === true
}

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function normalizeSurfaceKey(surface = '') {
  const normalized = asTrimmedString(surface).toLowerCase()
  if (normalized === 'chat_dock' || normalized === 'chat_terminal_compact') return 'chat_dock'
  if (normalized === 'terminal_panel' || normalized === 'chat_terminal_expanded') return 'terminal_panel'
  return ''
}

function doesSurfaceOwnInteractiveFocus(session = null, surfaceKey = '') {
  const normalizedSurface = normalizeSurfaceKey(surfaceKey)
  if (!normalizedSurface) return true
  const focusedSurface = normalizeSurfaceKey(session?.focusedSurface)
  if (!focusedSurface) return true
  return focusedSurface === normalizedSurface
}

function getSessionStateLabel(session = null, labels = {}) {
  if (isArchivedTerminalSession(session)) return labels.sessionArchived || 'Archived'
  const status = String(session?.status || 'running').trim().toLowerCase()
  if (status === 'exited') return labels.sessionEnded || 'Ended'
  if (status === 'closed') return labels.sessionClosed || 'Closed'
  return labels.sessionLive || 'Live'
}

function getRendererClipboardApi() {
  if (typeof window !== 'undefined' && window.addom?.clipboard) {
    return window.addom.clipboard
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard
  }
  return null
}

function clampContextMenuOffset(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeSingleLinePasteText(value = '') {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim()
}

function countTerminalPasteLines(value = '') {
  const text = String(value || '')
  if (!text) return 0
  return text.split(/\r\n|\r|\n/).length
}

export class TerminalViewportView extends React.Component {
  constructor(props) {
    super(props)
    this.hostElement = null
    this.controller = null
    this.menuElement = null
    this.lastFocusRequestKey = 0
    this.lastSelectionText = ''
    this.state = {
      ready: false,
      focused: false,
      contextMenu: null,
      searchOpen: false,
      searchQuery: '',
      searchResult: { resultIndex: -1, resultCount: 0 },
      zoomOffset: 0,
      pendingInteractiveFocus: false,
    }
  }

  componentDidMount() {
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.handleGlobalPointerDown, true)
      document.addEventListener('keydown', this.handleGlobalKeyDown, true)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.closeContextMenu)
    }
    this.syncController()
    this.applyFocusRequest()
  }

  componentDidUpdate(prevProps) {
    this.syncController()
    this.applyFocusRequest()
    const previousSessionId = String(prevProps?.session?.id || '').trim()
    const nextSessionId = String(this.props.session?.id || '').trim()
    if (previousSessionId !== nextSessionId && this.state.contextMenu) {
      this.closeContextMenu()
    }
    const previouslyInteractive = this.canSurfaceInteract(prevProps)
    const nowInteractive = this.canSurfaceInteract(this.props)
    if (previouslyInteractive && !nowInteractive) {
      this.clearVisibleSnapshot(previousSessionId, prevProps?.surfaceKey)
      this.controller?.blur?.()
      this.setFocused(false)
    }
    if (previousSessionId && previousSessionId !== nextSessionId) {
      this.clearVisibleSnapshot(previousSessionId, prevProps?.surfaceKey)
    }
    if (!previouslyInteractive && nowInteractive && this.state.pendingInteractiveFocus) {
      this.setState({ pendingInteractiveFocus: false }, () => {
        this.focusTerminal()
      })
    }
    if (previousSessionId !== nextSessionId && this.state.pendingInteractiveFocus) {
      this.setState({ pendingInteractiveFocus: false })
    }
  }

  componentWillUnmount() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.handleGlobalPointerDown, true)
      document.removeEventListener('keydown', this.handleGlobalKeyDown, true)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.closeContextMenu)
    }
    this.clearVisibleSnapshot(String(this.props.session?.id || '').trim(), this.props.surfaceKey)
    this.disposeController()
  }

  setHostElement = (element) => {
    if (this.hostElement === element) return
    this.hostElement = element
    if (!element) {
      this.disposeController()
      return
    }
    this.syncController()
  }

  setFocused = (focused) => {
    const nextFocused = focused === true
    if (this.state.focused === nextFocused) return
    this.setState({ focused: nextFocused })
  }

  setReady = (ready) => {
    const nextReady = ready === true
    if (this.state.ready === nextReady) return
    this.setState({ ready: nextReady })
  }

  focusTerminal = () => {
    this.controller?.focus?.()
  }

  setMenuElement = (element) => {
    this.menuElement = element
  }

  closeContextMenu = () => {
    if (!this.state.contextMenu) return
    this.setState({ contextMenu: null })
  }

  handleGlobalPointerDown = (event) => {
    if (!this.state.contextMenu) return
    if (this.menuElement?.contains?.(event.target)) return
    this.closeContextMenu()
  }

  handleGlobalKeyDown = (event) => {
    const keyAction = resolveTerminalKeyAction(event, resolveRendererPlatform())
    if (
      keyAction?.id === TERMINAL_KEY_ACTIONS.cutSelection
      && this.hostElement?.contains?.(event.target)
      && this.controller?.canDeleteSelection?.() === true
    ) {
      event.preventDefault()
      event.stopPropagation()
      this.handleCutShortcut()
      return
    }
    if (event.key !== 'Escape') return
    if (this.state.searchOpen) {
      event.preventDefault()
      event.stopPropagation()
      this.closeSearchBar()
      return
    }
    if (this.state.contextMenu) this.closeContextMenu()
  }

  keepTerminalFocusOnMenuPointer = (event) => {
    event.preventDefault()
  }

  handleContextMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const containerBounds = event.currentTarget?.getBoundingClientRect?.()
    if (!containerBounds) return
    const selectionText = String(this.controller?.getSelectionText?.() || this.lastSelectionText || '')
    const estimatedWidth = 196
    const estimatedHeight = 360
    const x = clampContextMenuOffset(
      event.clientX - containerBounds.left,
      12,
      Math.max(12, containerBounds.width - estimatedWidth - 12),
    )
    const y = clampContextMenuOffset(
      event.clientY - containerBounds.top,
      12,
      Math.max(12, containerBounds.height - estimatedHeight - 12),
    )
    this.setState({
      contextMenu: {
        x,
        y,
        canCut: !!selectionText && this.controller?.canDeleteSelection?.() === true,
        canCopy: !!selectionText,
        selectionText,
      },
    })
  }

  async writeClipboardText(value = '') {
    const clipboard = getRendererClipboardApi()
    if (!clipboard?.writeText) return false
    await clipboard.writeText(String(value || ''))
    return true
  }

  async readClipboardText() {
    const clipboard = getRendererClipboardApi()
    if (!clipboard?.readText) return ''
    return String(await clipboard.readText() || '')
  }

  copySelectionToClipboard = async (selectionText = '') => {
    const text = String(
      selectionText
      || this.state.contextMenu?.selectionText
      || this.controller?.getSelectionText?.()
      || this.lastSelectionText
      || '',
    )
    if (!text) return false
    try {
      return await this.writeClipboardText(text)
    } catch {
      return false
    }
  }

  cutSelectionToClipboard = async (selectionText = '') => {
    if (this.controller?.canDeleteSelection?.() !== true) return false
    const copied = await this.copySelectionToClipboard(selectionText)
    if (!copied) return false
    return this.controller?.deleteSelection?.() === true
  }

  pasteClipboardIntoTerminal = async () => {
    try {
      const text = await this.readClipboardText()
      if (!text) return false
      if (!(await this.confirmLargePaste(text))) return false
      this.controller?.pasteText?.(text)
      this.focusTerminal()
      return true
    } catch {
      return false
    }
  }

  pasteClipboardIntoTerminalAsSingleLine = async () => {
    try {
      const clipboardText = await this.readClipboardText()
      const text = normalizeSingleLinePasteText(clipboardText)
      if (!text) return false
      if (!(await this.confirmLargePaste(clipboardText))) return false
      this.controller?.pasteText?.(text)
      this.focusTerminal()
      return true
    } catch {
      return false
    }
  }

  copyVisibleOutputToClipboard = async () => {
    const text = String(this.controller?.getVisibleText?.() || '')
    if (!text) return false
    try {
      return await this.writeClipboardText(text)
    } catch {
      return false
    }
  }

  copyFullScrollbackToClipboard = async () => {
    const text = String(this.controller?.getFullScrollbackText?.() || '')
    if (!text) return false
    try {
      return await this.writeClipboardText(text)
    } catch {
      return false
    }
  }

  getTerminalOutputSnapshot(mode = 'selected_or_visible', maxChars = TERMINAL_CHAT_OUTPUT_MAX_CHARS) {
    return extractTerminalOutputContext({
      mode,
      selectedText: this.controller?.getSelectionText?.() || '',
      visibleText: this.controller?.getVisibleText?.() || '',
      fullScrollbackText: this.controller?.getFullScrollbackText?.() || '',
      rawOutput: this.props.rawOutput || '',
      maxChars,
    })
  }

  handleCopyShortcut = (selectionText = '') => {
    void this.copySelectionToClipboard(selectionText)
  }

  handleCutShortcut = (selectionText = '') => {
    void this.cutSelectionToClipboard(selectionText)
  }

  handlePasteShortcut = () => {
    void this.pasteClipboardIntoTerminal()
  }

  handleSelectionChange = (selectionText = '') => {
    this.lastSelectionText = String(selectionText || '')
    if (this.props.terminalSettings?.copyOnSelection !== true) return
    if (!String(selectionText || '').trim()) return
    void this.copySelectionToClipboard(selectionText)
  }

  openWorkspaceFileReference = (reference = {}) => openTerminalWorkspaceFileReference({
    projectFolder: this.props.projectFolder,
    sessionId: this.props.session?.id,
    reference,
  })

  createClipboardMenuHandler = (clipboardAction) => () => {
    void clipboardAction().finally(() => {
      this.closeContextMenu()
      this.focusTerminal()
    })
  }

  createTerminalMenuHandler = (terminalAction) => () => {
    terminalAction?.()
    this.closeContextMenu()
    this.focusTerminal()
  }

  createTerminalOutputMenuHandler = (action, mode, maxChars) => () => {
    const snapshot = this.getTerminalOutputSnapshot(mode, maxChars)
    if (!snapshot.text) return
    this.props.terminalOutputActions?.[action]?.(snapshot)
    this.closeContextMenu()
    this.focusTerminal()
  }

  openSearchBar = () => {
    if (!this.controller) return
    this.setState({ searchOpen: true })
  }

  closeSearchBar = () => {
    this.controller?.clearSearch?.()
    this.setState({
      searchOpen: false,
      searchQuery: '',
      searchResult: { resultIndex: -1, resultCount: 0 },
    }, () => {
      this.focusTerminal()
    })
  }

  setSearchResults = (searchResult = {}) => {
    this.setState({
      searchResult: {
        resultIndex: Number(searchResult?.resultIndex ?? -1),
        resultCount: Number(searchResult?.resultCount ?? 0),
      },
    })
  }

  runSearch = (query = '', options = {}) => {
    const searchQuery = String(query || '')
    const found = this.controller?.findNext?.(searchQuery, options) === true
    if (!searchQuery) {
      this.setSearchResults({ resultIndex: -1, resultCount: 0 })
    } else if (!found) {
      this.setSearchResults({ resultIndex: -1, resultCount: 0 })
    }
    return found
  }

  handleSearchQueryChange = (query = '') => {
    this.setState({ searchQuery: String(query || '') }, () => {
      this.runSearch(this.state.searchQuery, { incremental: true })
    })
  }

  handleSearchNext = () => {
    this.runSearch(this.state.searchQuery)
  }

  handleSearchPrevious = () => {
    const searchQuery = String(this.state.searchQuery || '')
    const found = this.controller?.findPrevious?.(searchQuery) === true
    if (searchQuery && !found) {
      this.setSearchResults({ resultIndex: -1, resultCount: 0 })
    }
  }

  handleFindShortcut = () => {
    this.openSearchBar()
  }

  handleClearShortcut = () => {
    this.controller?.clearBuffer?.()
    this.closeContextMenu()
    this.focusTerminal()
  }

  handleNewTerminalShortcut = () => {
    this.props.onNewTerminalRequest?.(this.props.session?.id)
  }

  handleCloseTerminalShortcut = () => {
    this.props.onCloseTerminalRequest?.(this.props.session?.id)
  }

  handleSwitchPreviousSessionShortcut = () => {
    this.props.onSwitchPreviousSessionRequest?.(this.props.session?.id)
  }

  handleSwitchNextSessionShortcut = () => {
    this.props.onSwitchNextSessionRequest?.(this.props.session?.id)
  }

  getEffectiveTerminalFontSize(props = this.props, state = this.state) {
    const baseFontSize = Number(props?.terminalSettings?.fontSize || TERMINAL_FONT_SIZE_DEFAULT) || TERMINAL_FONT_SIZE_DEFAULT
    return clampTerminalFontSize(baseFontSize + Number(state?.zoomOffset || 0))
  }

  handleZoomInShortcut = () => {
    this.setState((state) => ({ zoomOffset: Number(state.zoomOffset || 0) + 1 }))
  }

  handleZoomOutShortcut = () => {
    this.setState((state) => ({ zoomOffset: Number(state.zoomOffset || 0) - 1 }))
  }

  handleZoomResetShortcut = () => {
    this.setState({ zoomOffset: 0 })
  }

  async confirmLargePaste(value = '') {
    const lineCount = countTerminalPasteLines(value)
    const threshold = Number(this.props.terminalSettings?.pasteConfirmationLineThreshold || 0)
    if (!lineCount || lineCount < 2 || threshold <= 0 || lineCount < threshold) return true
    return requestAppConfirm({
      title: this.props.labels?.largePasteTitle,
      message: this.props.labels?.largePasteMessage?.(lineCount),
      confirmLabel: this.props.labels?.paste,
      cancelLabel: this.props.labels?.cancel,
      tone: 'warning',
    })
  }

  clearVisibleSnapshot(sessionId = '', surface = '') { this.publishVisibleSnapshot(sessionId, { surface, available: false }) }

  publishVisibleSnapshot(sessionId = '', snapshot = {}) {
    const terminalApi = typeof window !== 'undefined' ? window.addom?.terminal : null
    if (typeof terminalApi?.publishVisibleSnapshot !== 'function') return
    const normalizedSessionId = String(sessionId || '').trim()
    if (!normalizedSessionId) return
    void terminalApi.publishVisibleSnapshot(normalizedSessionId, { text: String(snapshot?.text || ''), capturedAt: Number(snapshot?.capturedAt || 0) || Date.now(), cols: Number(snapshot?.cols || 0) || undefined, rows: Number(snapshot?.rows || 0) || undefined, surface: String(snapshot?.surface || this.props.surfaceKey || '').trim(), available: snapshot?.available !== false }).catch(() => {})
  }

  disposeController() {
    this.controller?.dispose?.()
    this.controller = null
    if (this.state.ready || this.state.focused || this.state.contextMenu || this.state.searchOpen) {
      this.setState({
        ready: false,
        focused: false,
        contextMenu: null,
        searchOpen: false,
        searchQuery: '',
        searchResult: { resultIndex: -1, resultCount: 0 },
        zoomOffset: 0,
        pendingInteractiveFocus: false,
      })
    }
  }

  canSurfaceInteract(props = this.props) {
    return this.hasLiveInteractiveSession(props) && this.surfaceOwnsInteractiveFocus(props)
  }

  hasLiveInteractiveSession(props = this.props) {
    return isTerminalInteractive(props?.runtimeHealth, props?.session)
  }

  surfaceOwnsInteractiveFocus(props = this.props) {
    return doesSurfaceOwnInteractiveFocus(props?.session, props?.surfaceKey)
  }

  requestInteractiveSurfaceFocus = async () => {
    const { session = null, onRequestSurfaceFocus = null } = this.props
    const sessionId = asTrimmedString(session?.id)
    if (!sessionId || typeof onRequestSurfaceFocus !== 'function') return
    if (!this.hasLiveInteractiveSession()) return
    if (this.canSurfaceInteract()) {
      this.focusTerminal()
      return
    }
    this.setState({ pendingInteractiveFocus: true })
    const focused = await onRequestSurfaceFocus(sessionId)
    if (focused === false) {
      this.setState({ pendingInteractiveFocus: false })
    }
  }

  ensureController() {
    if (this.controller) return this.controller
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    if (!this.hostElement) return null

    try {
      this.controller = createDefaultXtermViewportController({
        hostElement: this.hostElement,
        onInput: (...args) => this.props.onInput?.(...args),
        onResize: (...args) => this.props.onResize?.(...args),
        onMetricsChange: (...args) => this.props.onMetricsChange?.(...args),
        onVisibleTextChange: (sessionId, snapshot) => this.publishVisibleSnapshot(sessionId, snapshot),
        onFocusChange: this.setFocused,
        onSearchResultsChange: this.setSearchResults,
        onOpenUrlLink: openExternalTerminalUrl,
        onOpenWorkspaceFileLink: this.openWorkspaceFileReference,
        onCutSelection: this.handleCutShortcut,
        onCopySelection: this.handleCopyShortcut,
        onPasteRequest: this.handlePasteShortcut,
        onFindRequest: this.handleFindShortcut,
        onClearRequest: this.handleClearShortcut,
        onNewTerminalRequest: this.handleNewTerminalShortcut,
        onCloseTerminalRequest: this.handleCloseTerminalShortcut,
        onSwitchPreviousSessionRequest: this.handleSwitchPreviousSessionShortcut,
        onSwitchNextSessionRequest: this.handleSwitchNextSessionShortcut,
        onZoomInRequest: this.handleZoomInShortcut,
        onZoomOutRequest: this.handleZoomOutShortcut,
        onZoomResetRequest: this.handleZoomResetShortcut,
        onSelectionChange: this.handleSelectionChange,
        projectFolder: this.props.projectFolder,
        fontSize: this.getEffectiveTerminalFontSize(),
        terminalSettings: this.props.terminalSettings,
      })
      if (!this.controller) {
        throw new Error('terminal_controller_init_failed')
      }
      this.setReady(true)
      return this.controller
    } catch (error) {
      console.error('[terminal] failed to initialize xterm viewport', error)
      this.disposeController()
      return null
    }
  }

  syncController() {
    const controller = this.ensureController()
    if (!controller) return

    controller.update({
      nextSessionId: String(this.props.session?.id || '').trim(),
      nextRawOutput: String(this.props.rawOutput || ''),
      nextCanInteract: this.canSurfaceInteract(),
      nextProjectFolder: this.props.projectFolder,
      nextFontSize: this.getEffectiveTerminalFontSize(),
      nextTerminalSettings: this.props.terminalSettings,
    })
  }

  applyFocusRequest() {
    const nextFocusRequestKey = Number(this.props.focusRequestKey) || 0
    if (!nextFocusRequestKey || nextFocusRequestKey === this.lastFocusRequestKey) return
    this.lastFocusRequestKey = nextFocusRequestKey
    if (!this.state.ready) return
    if (!this.canSurfaceInteract()) return
    this.focusTerminal()
  }

  render() {
    const {
      runtimeHealth = null,
      session = null,
      modelSessionId = '',
      outputTruncated = false,
      canCreate = false,
      creatingSession = false,
      onCreateSession = null,
      surfaceKey = '',
      labels = {},
    } = this.props
    const {
      ready,
      focused,
      contextMenu,
      searchOpen,
      searchQuery,
      searchResult,
    } = this.state
    const terminalFontSize = this.getEffectiveTerminalFontSize()
    const shortcutLabels = getTerminalShortcutLabels(resolveRendererPlatform())
    const runtimeStatus = String(runtimeHealth?.status || 'idle').trim().toLowerCase()
    const archived = isArchivedTerminalSession(session)
    const liveSessionAvailable = this.hasLiveInteractiveSession()
    const ownsInteractiveFocus = this.surfaceOwnsInteractiveFocus()
    const canInteract = liveSessionAvailable && ownsInteractiveFocus
    const hasSessionOutput = !!session
    const compactHeader = normalizeSurfaceKey(surfaceKey) === 'chat_dock' && !archived
    const sessionStateLabel = getSessionStateLabel(session, labels)
    const sessionTitle = asTrimmedString(session?.sessionTitle) || getPathTail(session?.cwd) || labels.workspaceShell || 'Workspace shell'
    const modelActive = String(modelSessionId || '').trim() === String(session?.id || '').trim()

    if (!session && runtimeStatus !== 'supported') {
      return (
        <section className="flex h-full items-center justify-center px-6 py-8" data-ui="terminal-viewport-empty">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-surface-border bg-surface-panel text-2xl text-text-tertiary">
              <span aria-hidden="true">&gt;_</span>
            </div>
            <p className="text-base font-semibold text-text-primary">
              {runtimeStatus === 'supported'
                ? (labels.startTitle || 'Start a terminal session')
                : (labels.unavailableTitle || 'Chat terminal is unavailable')}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {runtimeStatus === 'supported'
                ? (labels.startDescription || 'Create a workspace shell to run interactive commands inside the real terminal surface.')
                : (labels.unavailableDescription || 'The PTY runtime is not available in this app state. Check the terminal runtime banner for details.')}
            </p>
            {runtimeStatus === 'supported' && (
              <button
                type="button"
                onClick={() => onCreateSession?.()}
                disabled={!canCreate || creatingSession}
                className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingSession
                  ? (labels.startingSession || 'Starting session...')
                  : (labels.createSession || 'Create session')}
              </button>
            )}
          </div>
        </section>
      )
    }

    const showEmptyState = !session

    return (
      <section className="flex h-full min-h-0 flex-col" data-ui={showEmptyState ? 'terminal-viewport-empty' : 'terminal-viewport'}>
        {showEmptyState
          ? <div aria-hidden="true" className="hidden" />
          : (
            <div className={compactHeader ? 'hidden' : 'flex items-center justify-between gap-3 border-b border-surface-border/20 px-4 py-2 bg-surface-panel/10'}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <p className="truncate text-[13px] font-semibold text-text-primary">{sessionTitle}</p>
                <div className="flex items-center gap-1.5">
                  <span className={[
                    'rounded px-1.5 py-px text-[10px] font-medium tracking-wide',
                    archived
                      ? 'bg-surface-panel/80 text-text-tertiary'
                      : 'bg-success-bg/10 text-success-soft',
                  ].join(' ')}>
                    {sessionStateLabel}
                  </span>
                  {archived && (
                    <span className="rounded bg-warning-bg/10 px-1.5 py-px text-[10px] font-medium tracking-wide text-warning-soft">
                      {labels.readOnly || 'Read-only'}
                    </span>
                  )}
                  {modelActive && (
                    <span className="rounded bg-success-bg/10 px-1.5 py-px text-[10px] font-medium tracking-wide text-success-soft/80">
                      {labels.model || 'Model'}
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-text-tertiary">{session.cwd || labels.workspaceRoot || 'workspace root'}</p>
              </div>
              {outputTruncated && (
                <span className="shrink-0 rounded px-2 py-px text-[10px] font-medium tracking-wide bg-warning-bg/10 text-warning-soft">
                  {labels.trimmed || 'Trimmed'}
                </span>
              )}
            </div>
          )}

        <div className="min-h-0 flex-1 relative bg-surface">
          <div
            className={[
              'group/terminal-viewport relative h-full min-h-0 overflow-hidden',
              !compactHeader && focused
                ? 'ring-1 ring-inset ring-accent/30'
                : '',
            ].join(' ')}
            onMouseDown={(event) => {
              if (event.button !== 0) return
              if (liveSessionAvailable && !canInteract) {
                event.preventDefault()
                void this.requestInteractiveSurfaceFocus()
                return
              }
              this.focusTerminal()
            }}
            onContextMenu={this.handleContextMenu}
            data-ui="terminal-viewport-shell"
            data-focus-state={focused ? 'focused' : 'blurred'}
            data-surface-key={normalizeSurfaceKey(surfaceKey) || 'unscoped'}
          >
            {!compactHeader && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent" />}
            {!showEmptyState && !focused && liveSessionAvailable && ready && (
              <div data-ui="terminal-viewport-focus-hint" className="pointer-events-none absolute right-3 top-2 z-10 text-[10px] text-text-tertiary opacity-0 transition-opacity group-hover/terminal-viewport:opacity-100">
                {canInteract ? (labels.clickToFocus || 'Click to focus') : (labels.activateSurface || 'Activate surface')}
              </div>
            )}
            <div className="h-full w-full p-2">
              <div
                ref={this.setHostElement}
                className="h-full w-full cursor-text"
                data-ui="terminal-xterm-host"
                title={!focused && liveSessionAvailable && ready ? (canInteract ? (labels.clickToFocus || 'Click to focus') : (labels.activateSurface || 'Activate surface')) : undefined}
                aria-label={archived
                  ? (labels.archivedViewport || 'Archived terminal viewport')
                  : (labels.interactiveViewport || 'Interactive terminal viewport')}
              />
            </div>
            {showEmptyState
              ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(11,12,12,0.88),rgba(11,12,12,0.96))] px-6 py-8">
                  <div className="max-w-md text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-surface-border bg-surface-panel text-2xl text-text-tertiary">
                      <span aria-hidden="true">&gt;_</span>
                    </div>
                    <p className="text-base font-semibold text-text-primary">{labels.startTitle || 'Start a terminal session'}</p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {labels.startDescription || 'Create a workspace shell to run interactive commands inside the real terminal surface.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => onCreateSession?.()}
                      disabled={!canCreate || creatingSession}
                      className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingSession
                        ? (labels.startingSession || 'Starting session...')
                        : (labels.createSession || 'Create session')}
                    </button>
                  </div>
                </div>
              )
              : (
                <>
                  {searchOpen && (
                    <TerminalSearchBar
                      query={searchQuery}
                      result={searchResult}
                      labels={labels}
                      onQueryChange={this.handleSearchQueryChange}
                      onNext={this.handleSearchNext}
                      onPrevious={this.handleSearchPrevious}
                      onClose={this.closeSearchBar}
                    />
                  )}
                  {contextMenu && (
                    <TerminalContextMenu
                      menuRef={this.setMenuElement}
                      contextMenu={contextMenu}
                      labels={labels}
                      shortcutLabels={shortcutLabels}
                      canInteract={canInteract}
                      hasSessionOutput={hasSessionOutput}
                      archived={archived}
                      terminalFontSize={terminalFontSize}
                      onKeepFocusPointer={this.keepTerminalFocusOnMenuPointer}
                      onCutSelection={this.createClipboardMenuHandler(this.cutSelectionToClipboard)}
                      onCopySelection={this.createClipboardMenuHandler(this.copySelectionToClipboard)}
                      onCopyVisibleOutput={this.createClipboardMenuHandler(this.copyVisibleOutputToClipboard)}
                      onCopyFullScrollback={this.createClipboardMenuHandler(this.copyFullScrollbackToClipboard)}
                      onSendOutputToChat={this.createTerminalOutputMenuHandler('sendOutputToChat', 'selected_or_visible', TERMINAL_CHAT_OUTPUT_MAX_CHARS)}
                      onExplainLastError={this.createTerminalOutputMenuHandler('explainLastError', 'recent_tail', TERMINAL_ERROR_OUTPUT_MAX_CHARS)}
                      onSummarizeSession={this.createTerminalOutputMenuHandler('summarizeSession', 'full_bounded', TERMINAL_SUMMARY_OUTPUT_MAX_CHARS)}
                      onSaveSnapshotToMemory={this.createTerminalOutputMenuHandler('saveSnapshotToMemory', 'full_bounded', TERMINAL_MEMORY_OUTPUT_MAX_CHARS)}
                      memoryPending={this.props.terminalOutputActions?.memoryPending === true}
                      onPaste={this.createClipboardMenuHandler(this.pasteClipboardIntoTerminal)}
                      onPasteSingleLine={this.createClipboardMenuHandler(this.pasteClipboardIntoTerminalAsSingleLine)}
                      onSelectAll={this.createTerminalMenuHandler(() => this.controller?.selectAll?.())}
                      onClear={this.handleClearShortcut}
                      onZoomIn={this.createTerminalMenuHandler(this.handleZoomInShortcut)}
                      onZoomOut={this.createTerminalMenuHandler(this.handleZoomOutShortcut)}
                      onZoomReset={this.createTerminalMenuHandler(this.handleZoomResetShortcut)}
                    />
                  )}
                </>
              )}
          </div>
        </div>

      </section>
    )
  }
}

export default function TerminalViewport(props) {
  const { t } = useRendererTranslation(['core'])
  const appProjectFolder = useAppStore((state) => state.projectFolder)
  const rawTerminalSettings = useSettingsStore((state) => state.coreSettings?.terminal)
  const projectFolder = props.projectFolder || appProjectFolder
  const labels = React.useMemo(() => getTerminalViewportLabels(t), [t])
  const terminalSettings = React.useMemo(() => normalizeTerminalSettings(
    rawTerminalSettings,
    DEFAULT_TERMINAL_SETTINGS,
  ), [rawTerminalSettings])
  const terminalOutputActions = useTerminalOutputActions({
    session: props.session,
    rawOutput: props.rawOutput,
    projectFolder,
  })
  return (
    <TerminalViewportView
      {...props}
      projectFolder={projectFolder}
      labels={labels}
      terminalOutputActions={terminalOutputActions}
      terminalSettings={terminalSettings}
    />
  )
}
