import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resolveDocumentCompanionReferencePath } from '../../src/renderer/components/chat/evidence-file-navigation.mjs'
import { resolveProjectMarkdownLink } from '../../src/renderer/components/editor/editor-markdown-preview-utils.mjs'

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8')

test('managed plan links resolve from the active project root', () => {
  const managedPlanReferencePath = resolveDocumentCompanionReferencePath({
    sourceKind: 'managed_plan',
    filePath: 'managed-plan/plan_123.md',
  })
  assert.equal(managedPlanReferencePath, '')
  assert.equal(
    resolveProjectMarkdownLink({
      href: 'HARDWARE_TOOL_IMPROVEMENT_PLAN.md',
      currentFilePath: managedPlanReferencePath,
      projectFolder: 'C:/workspace/project',
    }).filePath,
    'HARDWARE_TOOL_IMPROVEMENT_PLAN.md',
  )
  assert.equal(
    resolveProjectMarkdownLink({
      href: 'hardware_info.py',
      currentFilePath: managedPlanReferencePath,
      projectFolder: 'C:/workspace/project',
    }).filePath,
    'hardware_info.py',
  )
  assert.equal(
    resolveDocumentCompanionReferencePath({
      sourceKind: 'project',
      filePath: 'docs/Plan.md',
    }),
    'docs/Plan.md',
  )
})

test('preload exposes a narrow versioned project-document API', () => {
  const preload = read('src/preload/index.mjs')
  const api = read('src/preload/preload-workspace-api.cjs')
  const documentApi = api.match(/function createDocumentsApi[\s\S]*?\n}\n\nfunction createProcessesApi/)?.[0] || ''

  assert.match(preload, /documents: createDocumentsApi/)
  assert.match(api, /read: \(projectId, filePath\) => invokeVersioned\('documents:read'/)
  assert.match(api, /reveal: \(projectId, filePath\) => invokeVersioned\('documents:reveal'/)
  assert.match(api, /readPlanState: \(\{ projectRoot, threadId, planId \} = \{\}\) => invokeVersioned\('documents:read-plan-state'/)
  assert.doesNotMatch(documentApi, /write|delete|rename|network/i)
})

test('the shared dock owns tabs, resize, focused mode, and hidden-surface semantics', () => {
  const app = read('src/renderer/App.jsx')
  const shell = read('src/renderer/components/chat/ChatCompanionShell.jsx')
  const styles = read('src/renderer/styles/globals-foundation.css')

  assert.match(shell, /role="tablist"/)
  assert.match(shell, /aria-orientation="vertical"/)
  assert.match(shell, /data-companion-resizer/)
  assert.match(shell, /aria-valuenow=/)
  assert.match(shell, /motion-reduce:transition-none/)
  assert.match(shell, /data-companion-mode=/)
  assert.match(shell, /inert=\{visible \? undefined : true\}/)
  assert.match(shell, /visible \? 'opacity-100' : 'hidden'/)
  assert.match(app, /chatCompanionFocused/)
  assert.match(app, /aria-hidden=\{chatCompanionFocused/)
  assert.match(app, /inert=\{chatCompanionFocused/)
  assert.match(app, /data-chat-workspace-main="true"/)
  assert.match(app, /data-companion-visible=/)
  assert.match(styles, /@media \(max-width: 1099px\)/)
  assert.match(styles, /data-chat-workspace-main='true'/)
  assert.match(styles, /data-companion-resizer/)
})

test('Markdown project references open the Document companion while explicit editor actions remain', () => {
  const link = read('src/renderer/components/chat/ProjectFileReferenceLink.jsx')
  const documentView = read('src/renderer/components/chat/DocumentCompanionView.jsx')

  assert.match(link, /isMarkdownDocumentPath/)
  assert.match(link, /openDocumentCompanion/)
  assert.match(documentView, /MemoProseMarkdown/)
  assert.match(documentView, /createFinalAnswerMarkdownComponents/)
  assert.match(documentView, /openFileAtLocation/)
  assert.match(documentView, /documents\?\.reveal/)
  assert.match(documentView, /file\?\.onTreeChanged/)
})

test('document search delegates focus indication to its container without a nested ring', () => {
  const search = read('src/renderer/components/chat/DocumentCompanionSearch.jsx')
  const styles = read('src/renderer/styles/globals-runtime.css')

  assert.match(search, /data-ui="document-companion-search-input"/)
  assert.match(styles, /\[data-ui="document-companion-search-input"\]:focus-visible/)
})

test('absolute tool evidence opens read-only in the document companion or editor', () => {
  const link = read('src/renderer/components/chat/ProjectFileReferenceLink.jsx')
  const documentView = read('src/renderer/components/chat/DocumentCompanionView.jsx')
  const editorStore = read('src/renderer/store/useEditorStore.js')
  const monacoPane = read('src/renderer/components/editor/EditorMonacoPane.jsx')

  assert.match(link, /resolveAbsoluteEvidenceFileReference/)
  assert.match(link, /data-evidence-file-reference="true"/)
  assert.match(link, /evidenceFilePath:/)
  assert.match(link, /openEvidenceFileAtLocation/)
  assert.match(documentView, /sourceKind === 'evidence'/)
  assert.match(editorStore, /openEvidenceFileAtLocation:/)
  assert.match(editorStore, /readOnly: true/)
  assert.match(monacoPane, /tab\?\.readOnly/)
})

test('managed plan readiness uses a dedicated live bridge instead of inspecting tool-result display payloads', () => {
  const preload = read('src/preload/preload-chat-api.cjs')
  const bridge = read('src/renderer/components/ChatEventBridge.jsx')
  const composerArea = read('src/renderer/components/chat/ChatPanelComposerArea.jsx')

  assert.match(preload, /onPlanDocumentReady: \(cb\) => subVersioned\('chat:plan-document-ready'/)
  assert.match(preload, /onPlanLifecycleEvent: \(cb\) => subVersioned\('chat:plan-lifecycle-event'/)
  assert.match(bridge, /chatApi\.onPlanDocumentReady/)
  assert.match(bridge, /chatApi\.onPlanLifecycleEvent/)
  assert.doesNotMatch(bridge, /toolName \|\| ''\)\.trim\(\) === 'plan_document_write'/)
  assert.match(composerArea, /plan\.lifecycle === 'ready_for_review' \|\| plan\.lifecycle === 'revising' \|\| plan\.lifecycle === 'approved'/)
})

test('managed plan review uses durable annotations and one contextual primary action', () => {
  const documentView = read('src/renderer/components/chat/DocumentCompanionView.jsx')
  const markdownComponents = read('src/renderer/components/chat/final-document/final-answer-markdown-components.jsx')
  const preload = read('src/preload/preload-workspace-api.cjs')
  const chatPanel = read('src/renderer/components/ChatPanel.jsx')

  assert.match(documentView, /addPlanReviewChange/)
  assert.match(documentView, /removePlanReviewChange/)
  assert.match(documentView, /submitPlanReviewChanges/)
  assert.match(documentView, /data-ui="managed-plan-primary-action"/)
  assert.match(documentView, /data-ui="managed-plan-change-count"/)
  assert.match(documentView, /data-ui="managed-plan-undo-last-change"/)
  assert.match(documentView, /core:companionDock\.document\.reviewHint/)
  assert.match(markdownComponents, /data-plan-annotation-block/)
  assert.match(markdownComponents, /data-plan-annotation-action/)
  assert.doesNotMatch(documentView, /capturePlanSelection|selectedPlanText|onMouseUp=/)
  assert.match(documentView, /queueManagedPlanTurnRequest/)
  assert.doesNotMatch(documentView, /approveManagedPlan|approvePlan/)
  assert.match(preload, /documents:add-plan-review-change/)
  assert.match(preload, /documents:submit-plan-review-changes/)
  assert.match(preload, /documents:implement-managed-plan/)
  assert.match(preload, /documents:reveal-managed-plan/)
  assert.match(preload, /documents:save-managed-plan-copy/)
  assert.match(documentView, /openEvidenceFileAtLocation/)
  assert.match(documentView, /saveManagedPlanCopy/)
  assert.doesNotMatch(preload, /documents:approve-managed-plan/)
  assert.match(chatPanel, /pendingManagedPlanTurnRequest/)
  assert.match(chatPanel, /Implement this exact accepted managed plan revision now\./)
})

test('managed plan review keeps the Markdown reading column natively selectable', () => {
  const documentView = read('src/renderer/components/chat/DocumentCompanionView.jsx')
  const documentStyles = read('src/renderer/styles/final-answer-document.css')

  assert.match(documentView, /data-document-reading-column="true"/)
  assert.match(documentView, /data-plan-review-surface=/)
  assert.match(documentView, /select-text/)
  assert.match(documentView, /documentReadingCursorClass\(view\?\.sourceKind\)/)
  assert.match(
    documentStyles,
    /\.final-answer-document\[data-plan-review-surface='true'\] \.final-answer-inline-code \{[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent;/,
  )
})

test('managed plan change actions align with their textarea rather than the section label', () => {
  const documentView = read('src/renderer/components/chat/DocumentCompanionView.jsx')

  assert.match(documentView, /data-ui="managed-plan-review-composer"[\s\S]*?className="relative mt-1 flex min-h-0 items-center gap-2"/)
})

test('managed plan change composer has calm focus chrome and a bounded resize surface', () => {
  const documentView = read('src/renderer/components/chat/DocumentCompanionView.jsx')
  const runtimeStyles = read('src/renderer/styles/globals-runtime.css')

  assert.match(documentView, /rows=\{2\}/)
  assert.match(documentView, /data-ui="managed-plan-review-composer-input"/)
  assert.match(documentView, /data-ui="managed-plan-review-instruction"/)
  assert.doesNotMatch(documentView, /focus:border-border-strong/)
  assert.match(documentView, /data-ui="managed-plan-review-tray"[\s\S]*?className="absolute inset-x-0 -bottom-1 z-10 h-2 cursor-row-resize touch-none outline-none"/)
  assert.match(documentView, /createPlanReviewComposerDragSession/)
  assert.match(runtimeStyles, /managed-plan-review-instruction.*focus-visible/)
})

test('managed plan annotations are suspended for document selections and an open change composer', () => {
  const documentView = read('src/renderer/components/chat/DocumentCompanionView.jsx')
  const documentStyles = read('src/renderer/styles/final-answer-document.css')

  assert.match(documentView, /document\.addEventListener\('selectionchange'/)
  assert.match(documentView, /annotationActionsEnabled/)
  assert.match(documentView, /data-plan-annotation-actions=/)
  assert.match(documentView, /dataset\.planAnnotationActions/)
  assert.doesNotMatch(documentView, /setHasPlanDocumentSelection/)
  assert.doesNotMatch(documentView, /enabled: annotationActionsEnabled/)
  assert.match(documentStyles, /data-plan-annotation-actions='disabled'/)
})
