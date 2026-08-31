import React, { useEffect, useMemo, useState } from 'react'
import useAppStore, { requestAppConfirm } from '../../store/useAppStore.js'
import useEditorStore from '../../store/useEditorStore.js'
import useChatStore from '../../store/useChatStore.js'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import {
  buildLiveTurnFileChangeState,
  collectTurnFileChanges,
  formatLiveUpdatedAgo,
  readDisplayedLineTotals,
  summarizeTurnFileChanges,
} from './turn-file-changes.mjs'
import RowActions from './turn-file-changes-actions.jsx'
import {
  basenameFromPath,
  changeTypeLabel,
  deriveRowSyncStatus,
  extensionFromPath,
  isCreatedFileChange,
  isDeletableCreatedFileChange,
  isLikelyOversizedForPreview,
  isUndoableFileChange,
  liveRowStateMapEqual,
  rowKeyFromEntry,
  rowSignature,
} from './turn-file-changes-card-helpers.mjs'
import TurnFileChangeExpandedPreview from './TurnFileChangeExpandedPreview.jsx'
import TurnFileChangesHeader from './TurnFileChangesHeader.jsx'
import { resolveProjectDocumentCompanionTarget } from './evidence-file-navigation.mjs'

function latestFilePathMapEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    const leftValue = left[key] && typeof left[key] === 'object' ? left[key] : {}
    const rightValue = right[key] && typeof right[key] === 'object' ? right[key] : {}
    if (String(leftValue.latestId || '') !== String(rightValue.latestId || '')) return false
    if (Number(leftValue.latestRev || 0) !== Number(rightValue.latestRev || 0)) return false
    if (String(leftValue.latestSource || '') !== String(rightValue.latestSource || '')) return false
    if (String(leftValue.latestNote || '') !== String(rightValue.latestNote || '')) return false
    if (String(leftValue.latestPrevRevId || '') !== String(rightValue.latestPrevRevId || '')) return false
    if (Number(leftValue.latestContentLength || 0) !== Number(rightValue.latestContentLength || 0)) return false
    if (Number(leftValue.latestAt || 0) !== Number(rightValue.latestAt || 0)) return false
  }
  return true
}

export default function TurnFileChangesCard({
  turnId = '',
  activities = [],
  fileRows = null,
  projectFolder = '',
  isLiveTurn = false,
  headerDockPosition = '',
  dockSource = '',
}) {
  const { t } = useRendererTranslation(['core'])
  const rows = useMemo(
    () => (Array.isArray(fileRows) ? fileRows : collectTurnFileChanges(activities)),
    [activities, fileRows],
  )
  const rowsDigest = useMemo(
    () => rows.map((row) => rowSignature(row)).join('||'),
    [rows],
  )
  const fileChangeSummary = useMemo(() => summarizeTurnFileChanges(rows), [rows])
  const setActivePanel = useAppStore((s) => s.setActivePanel)
  const activeProjectId = useAppStore((s) => s.activeProjectId)
  const openDocumentCompanion = useAppStore((s) => s.openDocumentCompanion)
  const openFile = useEditorStore((s) => s.openFile)
  const pushToolActivity = useChatStore((s) => s.pushToolActivity)

  const [collectionExpanded, setCollectionExpanded] = useState(false)
  const [openRows, setOpenRows] = useState(() => new Set())
  const [feedback, setFeedback] = useState('')
  const [latestByFilePath, setLatestByFilePath] = useState({})
  const [checkingLatest, setCheckingLatest] = useState(false)
  const [undoingAll, setUndoingAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [undoingKeys, setUndoingKeys] = useState(() => new Set())
  const [deletingKeys, setDeletingKeys] = useState(() => new Set())
  const [liveRowStateByKey, setLiveRowStateByKey] = useState({})
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    setCollectionExpanded(false)
    setOpenRows(new Set())
  }, [turnId])

  useEffect(() => {
    if (!isLiveTurn || rows.length === 0) return
    const timer = setInterval(() => {
      setNowTick(Date.now())
    }, 1_000)
    return () => clearInterval(timer)
  }, [isLiveTurn, rows.length])

  useEffect(() => {
    setLiveRowStateByKey((prev) => {
      const next = buildLiveTurnFileChangeState(rows, {
        isLiveTurn,
        previousByKey: prev,
        prefetchedByRevision: {},
        now: Date.now(),
      })
      return liveRowStateMapEqual(prev, next) ? prev : next
    })
  }, [rows, rowsDigest, isLiveTurn])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!projectFolder || rows.length === 0) {
        setLatestByFilePath((prev) => (Object.keys(prev).length > 0 ? {} : prev))
        return
      }
      const uniquePaths = Array.from(new Set(rows.map((row) => String(row?.fileChange?.filePath || '').trim()).filter(Boolean)))
      if (uniquePaths.length === 0) {
        setLatestByFilePath((prev) => (Object.keys(prev).length > 0 ? {} : prev))
        return
      }
      setCheckingLatest((prev) => (prev ? prev : true))
      try {
        const response = await window.addom.artifacts.getLatestForFiles(projectFolder, uniquePaths)
        if (cancelled) return
        const latestRows = Array.isArray(response?.rows) ? response.rows : []
        const next = {}
        for (const latestRow of latestRows) {
          const filePath = String(latestRow?.filePath || '').trim()
          if (!filePath) continue
          next[filePath] = {
            latestId: String(latestRow?.latestId || ''),
            latestRev: Number(latestRow?.latestRev || 0) || 0,
            latestSource: String(latestRow?.latestSource || ''),
            latestAt: Number(latestRow?.latestAt || 0) || 0,
          }
        }
        setLatestByFilePath((prev) => (latestFilePathMapEqual(prev, next) ? prev : next))
      } catch {
        if (!cancelled) {
          setLatestByFilePath((prev) => (Object.keys(prev).length > 0 ? {} : prev))
        }
      } finally {
        if (!cancelled) setCheckingLatest(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [projectFolder, rows, rowsDigest])

  const displayRows = useMemo(
    () => rows.map((row) => {
      const rowKey = rowKeyFromEntry(row)
      const liveState = rowKey ? (liveRowStateByKey[rowKey] || {}) : {}
      return {
        ...row,
        isLive: liveState.isLive === true,
        lastUpdatedAt: Number(liveState.lastUpdatedAt || row?.createdAt || 0) || 0,
      }
    }),
    [rows, liveRowStateByKey],
  )
  const turnState = useMemo(() => {
    const turnActivities = Array.isArray(activities) ? activities : []
    for (let index = turnActivities.length - 1; index >= 0; index -= 1) {
      const activity = turnActivities[index]
      const value = String(activity?.turnState || activity?.status || '').trim().toLowerCase()
      if (value) return value
    }
    return ''
  }, [activities])

  if (fileChangeSummary.fileCount <= 0) return null

  const toggleRow = (key) => {
    const id = String(key || '').trim()
    if (!id) return
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getRowSyncStatus = (row) => {
    const filePath = String(row?.fileChange?.filePath || '').trim()
    if (!filePath) return { kind: 'untracked', label: '', toneClass: '' }
    return deriveRowSyncStatus(row, latestByFilePath[filePath] || null, { turnState })
  }

  const hasUndoMetadata = (row) => isUndoableFileChange(row)
  const hasDeleteMetadata = (row) => isDeletableCreatedFileChange(row)

  const handleOpenFile = async (row) => {
    const filePath = String(row?.fileChange?.filePath || '').trim()
    if (!projectFolder || !filePath) return
    setActivePanel('editor')
    await openFile(projectFolder, filePath, { source: 'chat_file_changes' })
  }

  const handleOpenDocument = async (target) => {
    if (!target) return
    await openDocumentCompanion(target)
  }

  const handleReview = () => setActivePanel('artifacts')

  const handleCopyPath = async (filePath = '') => {
    const value = String(filePath || '').trim()
    if (!value) return
    try {
      if (typeof navigator === 'undefined' || !navigator?.clipboard?.writeText) {
        setFeedback(t('core:chat.fileChanges.feedback.clipboardUnavailable', { defaultValue: 'Clipboard is unavailable in this environment.' }))
        return
      }
      await navigator.clipboard.writeText(value)
      setFeedback(t('core:chat.fileChanges.feedback.copiedPath', { defaultValue: 'Copied path: {{path}}', path: value }))
    } catch {
      setFeedback(t('core:chat.fileChanges.feedback.copyFailed', { defaultValue: 'Failed to copy file path.' }))
    }
  }

  const markUndoBusy = (rowKey, busy) => {
    const key = String(rowKey || '')
    if (!key) return
    setUndoingKeys((prev) => {
      const next = new Set(prev)
      if (busy) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const markDeleteBusy = (rowKey, busy) => {
    const key = String(rowKey || '')
    if (!key) return
    setDeletingKeys((prev) => {
      const next = new Set(prev)
      if (busy) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const refreshLatestFileVersions = async () => {
    if (!projectFolder) return
    setCheckingLatest((prev) => (prev ? prev : true))
    try {
      const uniquePaths = Array.from(new Set(rows.map((r) => String(r?.fileChange?.filePath || '').trim()).filter(Boolean)))
      const response = await window.addom.artifacts.getLatestForFiles(projectFolder, uniquePaths)
      const next = {}
      for (const item of Array.isArray(response?.rows) ? response.rows : []) {
        const filePath = String(item?.filePath || '').trim()
        if (!filePath) continue
        next[filePath] = {
          latestId: String(item?.latestId || ''),
          latestRev: Number(item?.latestRev || 0) || 0,
          latestSource: String(item?.latestSource || ''),
          latestNote: String(item?.latestNote || ''),
          latestPrevRevId: String(item?.latestPrevRevId || ''),
          latestContentLength: Math.max(0, Number(item?.latestContentLength || 0) || 0),
          latestAt: Number(item?.latestAt || 0) || 0,
        }
      }
      setLatestByFilePath((prev) => (latestFilePathMapEqual(prev, next) ? prev : next))
    } catch {
      // non-fatal
    } finally {
      setCheckingLatest(false)
    }
  }

  const handleUndoOne = async (row) => {
    if (!projectFolder) return
    if (!hasUndoMetadata(row)) {
      setFeedback(t('core:chat.fileChanges.feedback.undoUnavailable', { defaultValue: 'Undo unavailable for this entry (missing revision metadata).' }))
      return
    }
    const filePath = String(row?.fileChange?.filePath || '').trim()
    if (!filePath) return
    const ok = await requestAppConfirm({
      title: t('core:chat.fileChanges.dialogs.undoOne.title', { defaultValue: 'Undo File Change' }),
      message: t('core:chat.fileChanges.dialogs.undoOne.message', { defaultValue: 'Restore the previous version of {{path}}?', path: filePath }),
      confirmLabel: t('core:chat.fileChanges.dialogs.undoOne.confirm', { defaultValue: 'Undo Change' }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'warning',
    })
    if (!ok) return
    const key = String(row?.key || '')
    markUndoBusy(key, true)
    setFeedback('')
    try {
      const result = await window.addom.artifacts.undoFileChange(projectFolder, {
        filePath,
        newRevId: String(row?.fileChange?.newRevId || ''),
        prevRevId: String(row?.fileChange?.prevRevId || ''),
        changeType: String(row?.fileChange?.changeType || ''),
        sequence: Number(row?.sequence || 0) || 0,
      })
      if (result?.ok) {
        setFeedback(t('core:chat.fileChanges.feedback.undoSucceeded', { defaultValue: 'Undid {{path}}.', path: filePath }))
        pushToolActivity({
          type: 'info',
          turnId: String(turnId || ''),
          eventKind: 'manual_revert',
          label: t('core:chat.fileChanges.activity.undoOne', { defaultValue: 'Undid file change: {{path}}', path: filePath }),
        })
      } else if (result?.conflict) {
        setFeedback(t('core:chat.fileChanges.feedback.conflict', { defaultValue: '{{path}}: changed since this turn.', path: filePath }))
      } else {
        setFeedback(t('core:chat.fileChanges.feedback.actionFailed', { defaultValue: '{{path}}: {{message}}', path: filePath, message: String(result?.error || t('core:chat.fileChanges.feedback.undoFailed', { defaultValue: 'Undo failed.' })) }))
      }
    } catch (error) {
      setFeedback(t('core:chat.fileChanges.feedback.actionFailed', { defaultValue: '{{path}}: {{message}}', path: filePath, message: String(error?.message || t('core:chat.fileChanges.feedback.undoFailed', { defaultValue: 'Undo failed.' })) }))
    } finally {
      markUndoBusy(key, false)
      await refreshLatestFileVersions()
    }
  }

  const handleDeleteCreatedOne = async (row) => {
    if (!projectFolder) return
    if (!hasDeleteMetadata(row)) {
      setFeedback(t('core:chat.fileChanges.feedback.deleteUnavailable', { defaultValue: 'Delete unavailable for this entry (missing revision metadata).' }))
      return
    }
    const filePath = String(row?.fileChange?.filePath || '').trim()
    if (!filePath) return
    const ok = await requestAppConfirm({
      title: t('core:chat.fileChanges.dialogs.deleteOne.title', { defaultValue: 'Delete Created File' }),
      message: t('core:chat.fileChanges.dialogs.deleteOne.message', { defaultValue: 'Delete {{path}}? This removes the file created in this turn from disk.', path: filePath }),
      confirmLabel: t('core:chat.fileChanges.dialogs.deleteOne.confirm', { defaultValue: 'Delete File' }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!ok) return
    const key = String(row?.key || '')
    markDeleteBusy(key, true)
    setFeedback('')
    try {
      const result = await window.addom.artifacts.undoFileChange(projectFolder, {
        filePath,
        newRevId: String(row?.fileChange?.newRevId || ''),
        prevRevId: String(row?.fileChange?.prevRevId || ''),
        changeType: String(row?.fileChange?.changeType || ''),
        sequence: Number(row?.sequence || 0) || 0,
      })
      if (result?.ok) {
        setFeedback(t('core:chat.fileChanges.feedback.deleteSucceeded', { defaultValue: 'Deleted created file {{path}}.', path: filePath }))
        pushToolActivity({
          type: 'info',
          turnId: String(turnId || ''),
          eventKind: 'manual_revert',
          label: t('core:chat.fileChanges.activity.deleteOne', { defaultValue: 'Deleted created file: {{path}}', path: filePath }),
        })
      } else if (result?.conflict) {
        setFeedback(t('core:chat.fileChanges.feedback.conflict', { defaultValue: '{{path}}: changed since this turn.', path: filePath }))
      } else {
        setFeedback(t('core:chat.fileChanges.feedback.actionFailed', { defaultValue: '{{path}}: {{message}}', path: filePath, message: String(result?.error || t('core:chat.fileChanges.feedback.deleteFailed', { defaultValue: 'Delete failed.' })) }))
      }
    } catch (error) {
      setFeedback(t('core:chat.fileChanges.feedback.actionFailed', { defaultValue: '{{path}}: {{message}}', path: filePath, message: String(error?.message || t('core:chat.fileChanges.feedback.deleteFailed', { defaultValue: 'Delete failed.' })) }))
    } finally {
      markDeleteBusy(key, false)
      await refreshLatestFileVersions()
    }
  }

  const handleUndoAll = async () => {
    if (!projectFolder || undoingAll || deletingAll) return
    setUndoingAll(true)
    setFeedback('')
    try {
      const targetRows = rows.filter((row) => !isCreatedFileChange(row) && getRowSyncStatus(row).kind === 'active')
      const eligibleRows = targetRows.filter((row) => hasUndoMetadata(row))
      const skippedNoMeta = Math.max(0, targetRows.length - eligibleRows.length)
      if (targetRows.length === 0 || eligibleRows.length === 0) {
        setFeedback(t('core:chat.fileChanges.feedback.undoAllUnavailable', { defaultValue: 'Undo all unavailable (missing revision metadata).' }))
        return
      }
      const ok = await requestAppConfirm({
        title: t('core:chat.fileChanges.dialogs.undoAll.title', { defaultValue: 'Undo File Changes' }),
        message: t('core:chat.fileChanges.dialogs.undoAll.message', { defaultValue: 'Restore the previous version for {{count}} file{{suffix}}?', count: eligibleRows.length, suffix: eligibleRows.length === 1 ? '' : 's' }),
        confirmLabel: eligibleRows.length === 1
          ? t('core:chat.fileChanges.dialogs.undoOne.confirm', { defaultValue: 'Undo Change' })
          : t('core:chat.fileChanges.dialogs.undoAll.confirm', { defaultValue: 'Undo Changes' }),
        cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
        tone: 'warning',
      })
      if (!ok) return
      const payload = eligibleRows.map((row) => ({
        filePath: String(row?.fileChange?.filePath || ''),
        newRevId: String(row?.fileChange?.newRevId || ''),
        prevRevId: String(row?.fileChange?.prevRevId || ''),
        changeType: String(row?.fileChange?.changeType || ''),
        sequence: Number(row?.sequence || 0) || 0,
      }))
      const result = await window.addom.artifacts.undoTurnFileChanges(projectFolder, payload)
      const undoSummary = result?.summary && typeof result.summary === 'object' ? result.summary : {}
      const success = Number(undoSummary.success || 0) || 0
      const conflicts = Number(undoSummary.conflicts || 0) || 0
      const failed = Number(undoSummary.failed || 0) || 0
      setFeedback(t('core:chat.fileChanges.feedback.undoAllSummary', { defaultValue: 'Undo all: {{success}} succeeded{{conflicts}}{{failed}}{{skipped}}.', success, conflicts: conflicts ? `, ${conflicts} conflicts` : '', failed: failed ? `, ${failed} failed` : '', skipped: skippedNoMeta ? `, ${skippedNoMeta} skipped` : '' }))
      pushToolActivity({
        type: 'info',
        turnId: String(turnId || ''),
        eventKind: 'manual_revert',
        label: t('core:chat.fileChanges.activity.undoAll', { defaultValue: 'Undo all file changes ({{success}} succeeded{{conflicts}}{{failed}}{{skipped}})', success, conflicts: conflicts ? `, ${conflicts} conflicts` : '', failed: failed ? `, ${failed} failed` : '', skipped: skippedNoMeta ? `, ${skippedNoMeta} skipped` : '' }),
      })
    } catch (error) {
      setFeedback(String(error?.message || t('core:chat.fileChanges.feedback.undoAllFailed', { defaultValue: 'Undo all failed.' })))
    } finally {
      setUndoingAll(false)
      await refreshLatestFileVersions()
    }
  }

  const handleDeleteAllCreated = async () => {
    if (!projectFolder || deletingAll || undoingAll) return
    setDeletingAll(true)
    setFeedback('')
    try {
      const targetRows = rows.filter((row) => isCreatedFileChange(row) && getRowSyncStatus(row).kind === 'active')
      const eligibleRows = targetRows.filter((row) => hasDeleteMetadata(row))
      const skippedNoMeta = Math.max(0, targetRows.length - eligibleRows.length)
      if (targetRows.length === 0 || eligibleRows.length === 0) {
        setFeedback(t('core:chat.fileChanges.feedback.deleteAllUnavailable', { defaultValue: 'Delete all unavailable (missing revision metadata).' }))
        return
      }
      const ok = await requestAppConfirm({
        title: t('core:chat.fileChanges.dialogs.deleteAll.title', { defaultValue: 'Delete Created Files' }),
        message: t('core:chat.fileChanges.dialogs.deleteAll.message', { defaultValue: 'Delete {{count}} file{{suffix}} created in this turn? This removes them from disk.', count: eligibleRows.length, suffix: eligibleRows.length === 1 ? '' : 's' }),
        confirmLabel: eligibleRows.length === 1
          ? t('core:chat.fileChanges.dialogs.deleteOne.confirm', { defaultValue: 'Delete File' })
          : t('core:chat.fileChanges.dialogs.deleteAll.confirm', { defaultValue: 'Delete Files' }),
        cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
        tone: 'danger',
      })
      if (!ok) return
      const payload = eligibleRows.map((row) => ({
        filePath: String(row?.fileChange?.filePath || ''),
        newRevId: String(row?.fileChange?.newRevId || ''),
        prevRevId: String(row?.fileChange?.prevRevId || ''),
        changeType: String(row?.fileChange?.changeType || ''),
        sequence: Number(row?.sequence || 0) || 0,
      }))
      const result = await window.addom.artifacts.undoTurnFileChanges(projectFolder, payload)
      const deleteSummary = result?.summary && typeof result.summary === 'object' ? result.summary : {}
      const success = Number(deleteSummary.success || 0) || 0
      const conflicts = Number(deleteSummary.conflicts || 0) || 0
      const failed = Number(deleteSummary.failed || 0) || 0
      setFeedback(t('core:chat.fileChanges.feedback.deleteAllSummary', { defaultValue: 'Delete created files: {{success}} succeeded{{conflicts}}{{failed}}{{skipped}}.', success, conflicts: conflicts ? `, ${conflicts} conflicts` : '', failed: failed ? `, ${failed} failed` : '', skipped: skippedNoMeta ? `, ${skippedNoMeta} skipped` : '' }))
      pushToolActivity({
        type: 'info',
        turnId: String(turnId || ''),
        eventKind: 'manual_revert',
        label: t('core:chat.fileChanges.activity.deleteAll', { defaultValue: 'Deleted created files ({{success}} succeeded{{conflicts}}{{failed}}{{skipped}})', success, conflicts: conflicts ? `, ${conflicts} conflicts` : '', failed: failed ? `, ${failed} failed` : '', skipped: skippedNoMeta ? `, ${skippedNoMeta} skipped` : '' }),
      })
    } catch (error) {
      setFeedback(String(error?.message || t('core:chat.fileChanges.feedback.deleteAllFailed', { defaultValue: 'Delete created files failed.' })))
    } finally {
      setDeletingAll(false)
      await refreshLatestFileVersions()
    }
  }

  const actionableUndoCount = rows.filter((row) => hasUndoMetadata(row) && getRowSyncStatus(row).kind === 'active').length
  const actionableDeleteCount = rows.filter((row) => hasDeleteMetadata(row) && getRowSyncStatus(row).kind === 'active').length
  const conflictCount = displayRows.filter((row) => getRowSyncStatus(row).kind === 'conflict').length
  const collectionPanelId = `turn-file-changes-${String(turnId || 'turn').replace(/[^a-zA-Z0-9_-]/g, '-')}${String(dockSource || '').trim() ? `-${String(dockSource).replace(/[^a-zA-Z0-9_-]/g, '-')}` : ''}`
  const showBulkUndo = (
    collectionExpanded
    && !!projectFolder
    && fileChangeSummary.fileCount > 1
    && actionableUndoCount > 0
  )
  const showBulkDelete = (
    collectionExpanded
    && !!projectFolder
    && fileChangeSummary.fileCount > 1
    && actionableDeleteCount > 0
  )
  const bulkActions = (showBulkUndo || showBulkDelete) ? (
    <>
      {showBulkUndo ? (
        <button
          type="button"
          onClick={handleUndoAll}
          disabled={undoingAll || deletingAll}
          className="group inline-flex h-7 w-7 items-center justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title={undoingAll
            ? t('core:chat.fileChanges.bulkActions.undoingTitle', { defaultValue: 'Undoing file changes' })
            : t('core:chat.fileChanges.bulkActions.undoTitle', { defaultValue: 'Undo file changes from this turn' })}
          aria-label={undoingAll
            ? t('core:chat.fileChanges.bulkActions.undoingTitle', { defaultValue: 'Undoing file changes' })
            : t('core:chat.fileChanges.bulkActions.undoTitle', { defaultValue: 'Undo file changes from this turn' })}
        >
          <span
            aria-hidden="true"
            className={`
              text-sm transition-all duration-200
              ${undoingAll ? 'ph ph-spinner animate-spin' : 'ph ph-arrow-counter-clockwise'}
              text-warning-soft group-hover:text-warning
            `}
          />
        </button>
      ) : null}
      {showBulkDelete ? (
        <button
          type="button"
          onClick={handleDeleteAllCreated}
          disabled={deletingAll || undoingAll}
          className="group inline-flex h-7 w-7 items-center justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          title={deletingAll
            ? t('core:chat.fileChanges.bulkActions.deletingTitle', { defaultValue: 'Deleting created files' })
            : t('core:chat.fileChanges.bulkActions.deleteTitle', { defaultValue: 'Delete created files from this turn' })}
          aria-label={deletingAll
            ? t('core:chat.fileChanges.bulkActions.deletingTitle', { defaultValue: 'Deleting created files' })
            : t('core:chat.fileChanges.bulkActions.deleteTitle', { defaultValue: 'Delete created files from this turn' })}
        >
          <span
            aria-hidden="true"
            className={`
              text-sm transition-all duration-200
              ${deletingAll ? 'ph ph-spinner animate-spin' : 'ph ph-x'}
              text-danger-soft group-hover:text-danger
            `}
          />
        </button>
      ) : null}
    </>
  ) : null

  return (
    <div
      className="w-full"
      data-turn-file-changes="true"
      data-turn-header-dock={headerDockPosition || undefined}
    >
      <TurnFileChangesHeader
        expanded={collectionExpanded}
        controlsId={collectionPanelId}
        summary={{ ...fileChangeSummary, conflictCount }}
        onToggle={() => setCollectionExpanded((expanded) => !expanded)}
        dockPosition={headerDockPosition}
        actions={bulkActions}
      />
      {collectionExpanded ? (
        <div id={collectionPanelId}>
          <div className="px-3 py-0.5">
        {displayRows.map((row) => {
          const filePath = String(row?.fileChange?.filePath || '').trim()
          const parentPath = filePath.includes('/')
            ? filePath.slice(0, filePath.lastIndexOf('/'))
            : ''
          const fileName = basenameFromPath(filePath)
          const ext = extensionFromPath(filePath)
          const rowKey = String(row?.key || filePath || '').trim()
          if (!rowKey) return null
          const open = openRows.has(rowKey)
          const { addedLines: added, removedLines: removed } = readDisplayedLineTotals(row?.fileChange || {})
          const syncStatus = getRowSyncStatus(row)
          const conflicted = syncStatus.kind === 'conflict'
          const undoBusy = undoingKeys.has(rowKey)
          const deleteBusy = deletingKeys.has(rowKey)
          const undoReady = hasUndoMetadata(row)
          const deleteReady = hasDeleteMetadata(row)
          const isActionable = syncStatus.kind === 'active'
          const canUndo = !!projectFolder && undoReady && isActionable && !(checkingLatest && !row?.isLive) && !conflicted && !deleteBusy && !undoingAll && !deletingAll
          const canDelete = !!projectFolder && deleteReady && isActionable && !(checkingLatest && !row?.isLive) && !conflicted && !undoBusy && !undoingAll && !deletingAll
          const changeType = changeTypeLabel(row?.fileChange?.changeType)
          const previewLimited = isLikelyOversizedForPreview(row)
          const documentTarget = resolveProjectDocumentCompanionTarget({
            projectId: activeProjectId,
            filePath,
          })
          const updatedAgo = row?.lastUpdatedAt
            ? formatLiveUpdatedAgo(row.lastUpdatedAt, nowTick)
            : ''
          return (
            <div key={rowKey} className="group/file-row border-b border-chat-border py-2 last:border-b-0">
              <div className="flex items-stretch gap-2">
                <button
                  onClick={() => toggleRow(rowKey)}
                  className="min-w-0 flex-1 text-left py-0.5 -mx-1.5 px-1.5 rounded-md transition-colors hover:bg-chat-border/40"
                  title={open
                    ? t('core:chat.fileChanges.preview.collapse', { defaultValue: 'Collapse preview' })
                    : t('core:chat.fileChanges.preview.expand', { defaultValue: 'Expand preview' })}
                  aria-expanded={open}
                  aria-label={open
                    ? t('core:chat.fileChanges.preview.collapseForFile', { defaultValue: 'Collapse preview for {{path}}', path: filePath || t('core:chat.fileChanges.preview.fileChangeFallback', { defaultValue: 'file change' }) })
                    : t('core:chat.fileChanges.preview.expandForFile', { defaultValue: 'Expand preview for {{path}}', path: filePath || t('core:chat.fileChanges.preview.fileChangeFallback', { defaultValue: 'file change' }) })}
                >
                  <div className="chat-typo-file-changes-row flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="chat-typo-file-changes-file-title min-w-0 truncate font-medium text-text-primary" title={filePath || 'Unknown file'}>
                      {fileName || t('core:chat.fileChanges.unknownFile', { defaultValue: 'Unknown file' })}
                    </p>
                    <span className="chat-typo-file-changes-file-meta uppercase tracking-wide text-text-secondary">
                      {ext}
                    </span>
                    <span className="text-text-subtle">{changeType}</span>
                    <span className="text-success">+{added}</span>
                    <span className="text-danger">-{removed}</span>
                    {syncStatus.label ? <span className={syncStatus.toneClass}>{syncStatus.label}</span> : null}
                    {previewLimited ? <span className="text-warning-soft">{t('core:chat.fileChanges.preview.limited', { defaultValue: 'preview limited' })}</span> : null}
                    {row?.isLive && updatedAgo ? <span className="text-text-secondary">{t('core:chat.fileChanges.updatedAgo', { defaultValue: 'updated {{time}}', time: updatedAgo })}</span> : null}
                    {open && parentPath ? (
                      <span className="chat-typo-file-changes-file-meta w-full truncate text-text-muted" title={parentPath}>
                        {parentPath}
                      </span>
                    ) : null}
                  </div>
                </button>
                <RowActions
                  onOpen={() => { void handleOpenFile(row) }}
                  onOpenDocument={documentTarget ? (() => { void handleOpenDocument(documentTarget) }) : null}
                  onReview={handleReview}
                  onCopyPath={() => { void handleCopyPath(filePath) }}
                  onUndo={deleteReady || !isActionable ? null : (() => { void handleUndoOne(row) })}
                  onDelete={deleteReady && isActionable ? (() => { void handleDeleteCreatedOne(row) }) : null}
                  className="md:opacity-0 md:group-hover/file-row:opacity-100 md:group-focus-within/file-row:opacity-100 md:transition-opacity"
                  canUndo={canUndo}
                  canDelete={canDelete}
                  undoBusy={undoBusy}
                  deleteBusy={deleteBusy}
                  undoReason={conflicted
                    ? t('core:chat.fileChanges.reason.changedSinceTurn', { defaultValue: 'Changed since this turn' })
                    : (!undoReady ? t('core:chat.fileChanges.reason.missingRevisionMetadata', { defaultValue: 'Missing revision metadata' }) : '')}
                  deleteReason={conflicted
                    ? t('core:chat.fileChanges.reason.changedSinceTurn', { defaultValue: 'Changed since this turn' })
                    : (!deleteReady ? t('core:chat.fileChanges.reason.missingRevisionMetadata', { defaultValue: 'Missing revision metadata' }) : '')}
                />
              </div>
              {open ? <TurnFileChangeExpandedPreview row={row} /> : null}
            </div>
          )
        })}
        {feedback ? (
          <p className="chat-typo-file-changes-feedback text-accent-soft">{feedback}</p>
        ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
