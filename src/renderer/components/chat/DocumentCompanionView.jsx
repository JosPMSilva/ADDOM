import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import useAppStore from '../../store/useAppStore.js'
import useChatStore from '../../store/useChatStore.js'
import useEditorStore from '../../store/useEditorStore.js'
import { MemoProseMarkdown } from '../markdown/LazyMarkdownRenderer.jsx'
import Icon from '../ui/Icon.jsx'
import DocumentCompanionSearch from './DocumentCompanionSearch.jsx'
import { createFinalAnswerMarkdownComponents } from './final-document/final-answer-markdown-components.jsx'
import { readAbsoluteEvidenceFile, resolveDocumentCompanionReferencePath } from './evidence-file-navigation.mjs'
import { hasPlanAnnotationTextSelection, resolvePlanAnnotationHeadingContext } from './document-companion-plan-annotation.mjs'
import { documentReadingCursorClass, isManagedPlanReviewable, resolveManagedPlanPrimaryAction } from './document-companion-plan-review.mjs'
import {
  clampPlanReviewComposerHeight,
  createPlanReviewComposerDragSession,
  MAX_PLAN_REVIEW_COMPOSER_HEIGHT,
  MIN_PLAN_REVIEW_COMPOSER_HEIGHT,
  startPlanReviewComposerDragPresentation,
} from './document-companion-plan-review-resize.mjs'

function normalizedPath(value = '') {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase()
}

function documentErrorCopy(t, error = '') {
  const key = String(error || '').trim()
  if (key === 'document_not_found') {
    return t('core:companionDock.document.missing', {
      defaultValue: 'This document no longer exists.',
    })
  }
  if (key === 'document_too_large') {
    return t('core:companionDock.document.tooLarge', {
      defaultValue: 'This document is too large to preview.',
    })
  }
  return t('core:companionDock.document.unavailable', {
    defaultValue: 'This document could not be loaded.',
  })
}

export default function DocumentCompanionView({ view }) {
  const { t } = useRendererTranslation(['core'])
  const projectFolder = useAppStore((state) => state.projectFolder)
  const setActivePanel = useAppStore((state) => state.setActivePanel)
  const [documentState, setDocumentState] = useState(() => view?.initialDocument || null)
  const [loading, setLoading] = useState(() => !view?.initialDocument)
  const [actionError, setActionError] = useState('')
  const [activePlanBlock, setActivePlanBlock] = useState(null)
  const [reviewHintDismissed, setReviewHintDismissed] = useState(false)
  const [reviewInstruction, setReviewInstruction] = useState('')
  const [reviewComposerHeight, setReviewComposerHeight] = useState(MIN_PLAN_REVIEW_COMPOSER_HEIGHT)
  const [planActionBusy, setPlanActionBusy] = useState(false)
  const refreshTimerRef = useRef(null)
  const markdownRootRef = useRef(null)
  const reviewInstructionRef = useRef(null)
  const reviewComposerRef = useRef(null)
  const reviewComposerResizeSessionRef = useRef(null)

  const loadDocument = useCallback(async () => {
    if (view?.sourceKind === 'managed_plan') {
      setLoading(true)
      try {
        const result = await window?.addom?.documents?.readManagedPlan?.({
          projectRoot: view.projectRoot,
          threadId: view.threadId,
          planId: view.planId,
        })
        setDocumentState(result || { ok: false, error: 'plan_document_unavailable' })
      } catch {
        setDocumentState({ ok: false, error: 'plan_document_unavailable' })
      } finally {
        setLoading(false)
      }
      return
    }
    if (view?.sourceKind === 'evidence') {
      setLoading(true)
      const result = await readAbsoluteEvidenceFile(window?.addom?.file, view.filePath)
      setDocumentState(
        result.ok
          ? {
              ok: true,
              projectId: view.projectId,
              filePath: view.filePath,
              name: view.sourceFilePath,
              content: result.content,
            }
          : { ok: false, error: 'document_unavailable' },
      )
      setLoading(false)
      return
    }
    const readDocument = window?.addom?.documents?.read
    if (typeof readDocument !== 'function') {
      setDocumentState({ ok: false, error: 'document_bridge_unavailable' })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await readDocument(view.projectId, view.filePath)
      setDocumentState(result)
    } catch {
      setDocumentState({ ok: false, error: 'document_unavailable' })
    } finally {
      setLoading(false)
    }
  }, [view.filePath, view.planId, view.projectId, view.projectRoot, view.sourceFilePath, view.sourceKind, view.threadId])

  useEffect(() => {
    setDocumentState(view?.initialDocument || null)
    setLoading(!view?.initialDocument)
    setActionError('')
    setActivePlanBlock(null)
    setReviewInstruction('')
    setReviewComposerHeight(MIN_PLAN_REVIEW_COMPOSER_HEIGHT)
    setReviewHintDismissed(false)
    if (!view?.initialDocument) void loadDocument()
  }, [loadDocument, view?.initialDocument, view?.key])

  useEffect(() => {
    const subscribe = window?.addom?.file?.onTreeChanged
    if (typeof subscribe !== 'function') return undefined
    return subscribe((payload = {}) => {
      if (normalizedPath(payload.filePath) !== normalizedPath(view.filePath)) return
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => {
        void loadDocument()
      }, 120)
    })
  }, [loadDocument, view.filePath])

  useEffect(() => {
    if (view?.sourceKind !== 'managed_plan' || typeof document === 'undefined') {
      return undefined
    }
    const syncPlanDocumentSelection = () => {
      const root = markdownRootRef.current
      if (!root) return
      root.dataset.planAnnotationActions = activePlanBlock || hasPlanAnnotationTextSelection(root)
        ? 'disabled'
        : 'enabled'
    }
    document.addEventListener('selectionchange', syncPlanDocumentSelection)
    syncPlanDocumentSelection()
    return () => document.removeEventListener('selectionchange', syncPlanDocumentSelection)
  }, [activePlanBlock, view?.key, view?.sourceKind])

  useEffect(
    () => () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      reviewComposerResizeSessionRef.current?.cleanup()
    },
    [],
  )

  const openInEditor = () => {
    if (view?.sourceKind === 'managed_plan') return
    setActivePanel('editor')
    if (view?.sourceKind === 'evidence') {
      void useEditorStore.getState().openEvidenceFileAtLocation?.(view.filePath)
      return
    }
    if (!projectFolder) return
    void useEditorStore.getState().openFileAtLocation(projectFolder, view.filePath, undefined, undefined, {
      source: 'document_companion_action',
    })
  }

  const reveal = async () => {
    setActionError('')
    try {
      if (view?.sourceKind === 'managed_plan') return
      if (view?.sourceKind === 'evidence') {
        await window?.addom?.shell?.openPath?.(view.sourceRoot)
        return
      }
      const result = await window?.addom?.documents?.reveal?.(view.projectId, view.filePath)
      if (result?.ok === false) setActionError(documentErrorCopy(t, result.error))
    } catch {
      setActionError(documentErrorCopy(t, 'document_unavailable'))
    }
  }

  const content = documentState?.ok === true ? String(documentState.content || '') : ''
  const pendingReviewChanges = useMemo(() => (Array.isArray(documentState?.review?.pendingChanges) ? documentState.review.pendingChanges : []), [documentState?.review?.pendingChanges])
  const planReviewable = isManagedPlanReviewable(documentState)
  const primaryPlanAction = resolveManagedPlanPrimaryAction(documentState)
  const annotationActionsEnabled = !activePlanBlock
  const handleReviewComposerResizePointerDown = useCallback((event) => {
    if (event.button !== 0 || event.isPrimary === false) return
    event.preventDefault()
    reviewComposerResizeSessionRef.current?.cleanup()
    const captureTarget = event.currentTarget
    const restorePresentation = startPlanReviewComposerDragPresentation({
      rowElement: reviewComposerRef.current,
      bodyElement: document.body,
    })
    reviewComposerResizeSessionRef.current = createPlanReviewComposerDragSession({
      eventTarget: window,
      captureTarget,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeight: reviewComposerHeight,
      onPreview: (nextHeight) => {
        reviewComposerRef.current?.style.setProperty('height', `${nextHeight}px`)
      },
      onCancel: () => {
        reviewComposerResizeSessionRef.current = null
        reviewComposerRef.current?.style.setProperty('height', `${reviewComposerHeight}px`)
      },
      onCleanup: restorePresentation,
      onCommit: (nextHeight) => {
        reviewComposerResizeSessionRef.current = null
        setReviewComposerHeight(nextHeight)
      },
    })
  }, [reviewComposerHeight])
  const handleReviewComposerResizeKeyDown = useCallback((event) => {
    if (!['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) return
    event.preventDefault()
    const nextHeight = event.key === 'Home'
      ? MIN_PLAN_REVIEW_COMPOSER_HEIGHT
      : event.key === 'End'
        ? MAX_PLAN_REVIEW_COMPOSER_HEIGHT
        : clampPlanReviewComposerHeight(reviewComposerHeight + (event.key === 'ArrowDown' ? 16 : -16))
    setReviewComposerHeight(nextHeight)
  }, [reviewComposerHeight])
  const beginPlanAnnotation = useCallback(
    (target = {}) => {
      if (view?.sourceKind !== 'managed_plan' || !planReviewable) return
      const heading = resolvePlanAnnotationHeadingContext(markdownRootRef.current, target.element)
      setActivePlanBlock({
        blockId: String(target.blockId || ''),
        blockKind: String(target.blockKind || ''),
        blockText: String(target.blockText || '').slice(0, 4_000),
        headingAnchor: heading.anchor,
        headingLabel: heading.label,
      })
      setReviewInstruction('')
      setReviewHintDismissed(true)
      window.requestAnimationFrame?.(() => reviewInstructionRef.current?.focus())
    },
    [planReviewable, view?.sourceKind],
  )

  const addReviewChange = useCallback(async () => {
    const instruction = reviewInstruction.trim()
    if (!activePlanBlock?.blockId || !instruction || planActionBusy) return
    setPlanActionBusy(true)
    setActionError('')
    try {
      const result = await window?.addom?.documents?.addPlanReviewChange?.({
        projectRoot: view.projectRoot,
        threadId: view.threadId,
        planId: view.planId,
        expectedRevision: Number(documentState?.revision || 0),
        headingAnchor: activePlanBlock.headingAnchor,
        blockId: activePlanBlock.blockId,
        blockKind: activePlanBlock.blockKind,
        blockText: activePlanBlock.blockText,
        instruction,
      })
      if (!result?.plan) throw new Error('The review change could not be saved.')
      setDocumentState((current) => ({
        ...current,
        revision: result.plan.revision,
        lifecycle: result.plan.lifecycle,
        review: result.plan.review,
      }))
      setActivePlanBlock(null)
      setReviewInstruction('')
    } catch (error) {
      setActionError(String(error?.message || 'The review change could not be saved.'))
    } finally {
      setPlanActionBusy(false)
    }
  }, [activePlanBlock, documentState?.revision, planActionBusy, reviewInstruction, view.planId, view.projectRoot, view.threadId])

  const removeReviewChange = useCallback(
    async (changeId) => {
      if (view?.sourceKind !== 'managed_plan' || planActionBusy) return
      setPlanActionBusy(true)
      setActionError('')
      try {
        const result = await window?.addom?.documents?.removePlanReviewChange?.({
          projectRoot: view.projectRoot,
          threadId: view.threadId,
          planId: view.planId,
          expectedRevision: Number(documentState?.revision || 0),
          changeId,
        })
        if (!result?.plan) throw new Error('The review change could not be removed.')
        setDocumentState((current) => ({
          ...current,
          revision: result.plan.revision,
          lifecycle: result.plan.lifecycle,
          review: result.plan.review,
        }))
      } catch (error) {
        setActionError(String(error?.message || 'The review change could not be removed.'))
      } finally {
        setPlanActionBusy(false)
      }
    },
    [documentState?.revision, planActionBusy, view?.planId, view?.projectRoot, view?.sourceKind, view?.threadId],
  )

  const submitReviewChanges = useCallback(async () => {
    if (view?.sourceKind !== 'managed_plan' || planActionBusy || pendingReviewChanges.length === 0) return
    setPlanActionBusy(true)
    setActionError('')
    try {
      const result = await window?.addom?.documents?.submitPlanReviewChanges?.({
        projectRoot: view.projectRoot,
        threadId: view.threadId,
        planId: view.planId,
        expectedRevision: Number(documentState?.revision || 0),
      })
      if (!result?.plan || !result?.action) throw new Error('The review changes could not be submitted.')
      setDocumentState((current) => ({
        ...current,
        revision: result.plan.revision,
        lifecycle: result.plan.lifecycle,
        review: result.plan.review,
      }))
      useChatStore.getState().setChatMode('plan')
      void window?.addom?.settings?.set?.({ chatMode: 'plan' }).catch(() => {})
      useAppStore.getState().queueManagedPlanTurnRequest({
        kind: 'revise_plan',
        threadId: view.threadId,
        planAction: result.action,
      })
      useAppStore.getState().setActivePanel('chat')
    } catch (error) {
      setActionError(String(error?.message || 'The review changes could not be submitted.'))
    } finally {
      setPlanActionBusy(false)
    }
  }, [documentState?.revision, pendingReviewChanges.length, planActionBusy, view?.planId, view?.projectRoot, view?.sourceKind, view?.threadId])

  const implementManagedPlan = useCallback(async () => {
    if (view?.sourceKind !== 'managed_plan' || planActionBusy || !content) return
    setPlanActionBusy(true)
    setActionError('')
    try {
      const result = await window?.addom?.documents?.implementManagedPlan?.({
        projectRoot: view.projectRoot,
        threadId: view.threadId,
        planId: view.planId,
        expectedRevision: Number(documentState?.revision || 0),
      })
      if (!result?.plan || !result?.handoff) throw new Error('The plan could not be started.')
      setDocumentState((current) => ({
        ...current,
        revision: result.plan.revision,
        lifecycle: result.plan.lifecycle,
        review: result.plan.review,
      }))
      useChatStore.getState().setChatMode('execute')
      void window?.addom?.settings?.set?.({ chatMode: 'execute' }).catch(() => {})
      useAppStore.getState().queueManagedPlanTurnRequest({
        kind: 'implement_plan',
        threadId: view.threadId,
        handoff: result.handoff,
        content,
      })
      useAppStore.getState().setActivePanel('chat')
    } catch (error) {
      setActionError(String(error?.message || 'The plan could not be started.'))
    } finally {
      setPlanActionBusy(false)
    }
  }, [content, documentState?.revision, planActionBusy, view?.planId, view?.projectRoot, view?.sourceKind, view?.threadId])

  const referencePath = resolveDocumentCompanionReferencePath(view)
  const stagedBlockIds = useMemo(() => pendingReviewChanges.map((change) => change.blockId).filter(Boolean), [pendingReviewChanges])
  const components = useMemo(
    () =>
      createFinalAnswerMarkdownComponents({
        currentFilePath: referencePath,
        planAnnotations:
          view?.sourceKind === 'managed_plan' && planReviewable
            ? {
                activeBlockId: activePlanBlock?.blockId || '',
                stagedBlockIds,
                onAnnotate: beginPlanAnnotation,
                actionLabel: t('core:companionDock.document.annotateChange', {
                  defaultValue: 'Annotate change',
                }),
              }
            : null,
      }),
    [activePlanBlock?.blockId, beginPlanAnnotation, planReviewable, referencePath, stagedBlockIds, t, view?.sourceKind],
  )

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface" data-ui="document-companion-view">
      <div className="flex min-h-9 shrink-0 items-center justify-between gap-2 border-b border-surface-border px-3">
        <DocumentCompanionSearch content={content} contentRootRef={markdownRootRef} documentKey={view.key} />
        <div className="flex shrink-0 items-center gap-1">
          {view?.sourceKind === 'managed_plan' && pendingReviewChanges.length > 0 ? (
            <>
              <span data-ui="managed-plan-change-count" className="px-1 text-[11px] text-text-tertiary">
                {t('core:companionDock.document.changeCount', {
                  count: pendingReviewChanges.length,
                  defaultValue: '{{count}} changes',
                })}
              </span>
              <button
                type="button"
                data-ui="managed-plan-undo-last-change"
                onClick={() => {
                  void removeReviewChange(pendingReviewChanges.at(-1)?.id)
                }}
                disabled={planActionBusy || !planReviewable}
                aria-label={t('core:companionDock.document.undoLastChange', {
                  defaultValue: 'Undo latest change',
                })}
                title={t('core:companionDock.document.undoLastChange', {
                  defaultValue: 'Undo latest change',
                })}
                className="flex size-7 items-center justify-center rounded-md text-text-tertiary outline-none hover:bg-surface-panel hover:text-text-primary disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-border-strong"
              >
                <Icon name="arrow-counter-clockwise" size={14} />
              </button>
            </>
          ) : null}
          {view?.sourceKind === 'managed_plan' && primaryPlanAction ? (
            <button
              type="button"
              onClick={() => {
                if (primaryPlanAction.kind === 'submit_changes') void submitReviewChanges()
                else void implementManagedPlan()
              }}
              disabled={planActionBusy || primaryPlanAction.disabled}
              data-ui="managed-plan-primary-action"
              className="rounded-md px-2 py-1 text-xs text-text-secondary outline-none hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
            >
              {primaryPlanAction.kind === 'submit_changes'
                ? t('core:companionDock.document.submitChanges', {
                    defaultValue: 'Submit changes',
                  })
                : t('core:companionDock.document.implementPlan', {
                    defaultValue: 'Implement',
                  })}
            </button>
          ) : null}
          <button
            type="button"
            onClick={openInEditor}
            aria-label={t('core:companionDock.document.openInEditor', {
              defaultValue: 'Open in editor',
            })}
            title={t('core:companionDock.document.openInEditor', {
              defaultValue: 'Open in editor',
            })}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
          >
            <Icon name="code" size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              void reveal()
            }}
            aria-label={t('core:companionDock.document.reveal', {
              defaultValue: 'Reveal in file explorer',
            })}
            title={t('core:companionDock.document.reveal', {
              defaultValue: 'Reveal in file explorer',
            })}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
          >
            <Icon name="folder-open" size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              void loadDocument()
            }}
            aria-label={t('core:companionDock.document.reload', {
              defaultValue: 'Reload document',
            })}
            title={t('core:companionDock.document.reload', {
              defaultValue: 'Reload document',
            })}
            className="flex size-7 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
          >
            <Icon name="arrows-clockwise" size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {view?.sourceKind === 'managed_plan' && activePlanBlock ? (
        <div className="relative shrink-0 border-b border-surface-border bg-surface-subtle px-3 py-2" data-ui="managed-plan-review-tray">
          <div className="space-y-2">
            <div className="flex items-end gap-2" data-ui="managed-plan-review-composer">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] text-text-tertiary">{activePlanBlock.headingLabel || activePlanBlock.headingAnchor || activePlanBlock.blockText}</p>
                <div
                  ref={reviewComposerRef}
                  className="relative mt-1 flex min-h-0 items-center gap-2"
                  style={{ height: `${reviewComposerHeight}px` }}
                >
                  <div data-ui="managed-plan-review-composer-input" className="h-full min-w-0 flex-1">
                    <textarea
                      ref={reviewInstructionRef}
                      data-ui="managed-plan-review-instruction"
                      value={reviewInstruction}
                      onChange={(event) => setReviewInstruction(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Escape') return
                        setActivePlanBlock(null)
                        setReviewInstruction('')
                      }}
                      placeholder={t('core:companionDock.document.changePlaceholder', { defaultValue: 'Describe the change…' })}
                      aria-label={t('core:companionDock.document.changePlaceholder', { defaultValue: 'Describe the change…' })}
                      rows={2}
                      className="h-full w-full resize-none rounded-md border border-surface-border bg-surface px-2 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void addReviewChange()
                    }}
                    disabled={!reviewInstruction.trim() || planActionBusy}
                    className="shrink-0 rounded-md px-2 py-1.5 text-xs text-text-secondary outline-none hover:bg-surface-panel hover:text-text-primary disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-border-strong"
                  >
                    {t('core:companionDock.document.addChange', {
                      defaultValue: 'Add change',
                    })}
                  </button>
                </div>
              </div>
            </div>
            {documentState?.review?.submission?.status === 'failed' && documentState.review.submission.error ? (
              <p className="text-[11px] text-danger-soft" role="status">
                {documentState.review.submission.error}
              </p>
            ) : null}
          </div>
          <div
            data-ui="managed-plan-review-composer-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('core:companionDock.document.resizeChangeEditor', { defaultValue: 'Resize change editor' })}
            aria-valuemin={MIN_PLAN_REVIEW_COMPOSER_HEIGHT}
            aria-valuemax={MAX_PLAN_REVIEW_COMPOSER_HEIGHT}
            aria-valuenow={reviewComposerHeight}
            tabIndex={0}
            onKeyDown={handleReviewComposerResizeKeyDown}
            onPointerDown={handleReviewComposerResizePointerDown}
            className="absolute inset-x-0 -bottom-1 z-10 h-2 cursor-row-resize touch-none outline-none"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5" aria-busy={loading ? 'true' : undefined}>
        {loading && !documentState ? (
          <p className="text-sm text-text-muted">
            {t('core:companionDock.document.loading', {
              defaultValue: 'Loading document…',
            })}
          </p>
        ) : documentState?.ok === true ? (
          <div
            ref={markdownRootRef}
            className={`final-answer-document mx-auto min-w-0 w-full max-w-[960px] select-text ${documentReadingCursorClass(view?.sourceKind)}`}
            data-document-markdown="true"
            data-document-reading-column="true"
            data-plan-review-surface={view?.sourceKind === 'managed_plan' ? 'true' : undefined}
            data-plan-annotation-actions={view?.sourceKind === 'managed_plan' && planReviewable ? (annotationActionsEnabled ? 'enabled' : 'disabled') : undefined}
          >
            {view?.sourceKind === 'managed_plan' && planReviewable && pendingReviewChanges.length === 0 && !activePlanBlock && !reviewHintDismissed ? (
              <p className="mb-3 text-[11px] text-text-muted" data-ui="managed-plan-review-hint">
                {t('core:companionDock.document.reviewHint', {
                  defaultValue: 'Hover a paragraph to suggest a change.',
                })}
              </p>
            ) : null}
            <MemoProseMarkdown text={content} components={components} />
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-text-secondary">{documentErrorCopy(t, documentState?.error)}</p>
            <button
              type="button"
              onClick={() => {
                void loadDocument()
              }}
              className="mt-3 rounded-md px-2 py-1 text-xs text-text-secondary outline-none hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
            >
              {t('core:companionDock.document.retry', {
                defaultValue: 'Retry',
              })}
            </button>
          </div>
        )}
      </div>
      {actionError ? (
        <div className="shrink-0 border-t border-surface-border px-3 py-2 text-[11px] text-danger-soft" role="status">
          {actionError}
        </div>
      ) : null}
    </section>
  )
}
