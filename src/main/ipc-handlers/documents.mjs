import * as electron from 'electron'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import {
  readProjectDocument,
  revealProjectDocument,
} from '../documents/project-document-service.mjs'
import {
  addPlanReviewChange,
  answerPlanDirectionQuestion,
  beginPlanReviewRevision,
  changePlanDirection,
  implementManagedPlan,
  readPlanState,
  readManagedPlanDocument,
  removePlanReviewChange,
  retryPlanDirectionSynthesis,
  selectPlanAuthoringProfile,
} from '../chat/plan-runtime-state.mjs'
import { migrateLegacyRendererPlanState } from '../chat/plan-runtime-legacy-migration.mjs'
import { revealManagedPlan, saveManagedPlanCopy } from '../documents/managed-plan-file-actions.mjs'

const { ipcMain, shell, dialog, BrowserWindow } = electron

export function registerDocumentHandlers({
  ipcMain: ipcMainImpl = ipcMain,
  listProjects,
  showItemInFolder = (targetPath) => shell.showItemInFolder(targetPath),
  showSaveDialog = (event, options) => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options)
  },
} = {}) {
  const deps = { listProjects, showItemInFolder }
  handleVersioned(ipcMainImpl, 'documents:reveal-managed-plan', (_event, payload = {}) => (
    revealManagedPlan(payload, { showItemInFolder })
  ))
  handleVersioned(ipcMainImpl, 'documents:save-managed-plan-copy', (event, payload = {}) => (
    saveManagedPlanCopy(payload, { showSaveDialog: (options) => showSaveDialog(event, options) })
  ))
  handleVersioned(ipcMainImpl, 'documents:read', (_event, payload = {}) => (
    readProjectDocument(payload, deps)
  ))
  handleVersioned(ipcMainImpl, 'documents:reveal', (_event, payload = {}) => (
    revealProjectDocument(payload, deps)
  ))
  handleVersioned(ipcMainImpl, 'documents:read-managed-plan', (_event, payload = {}) => (
    readManagedPlanDocument(String(payload?.projectRoot || ''), {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:read-plan-state', (_event, payload = {}) => (
    readPlanState(String(payload?.projectRoot || ''), {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:add-plan-review-change', (_event, payload = {}) => (
    addPlanReviewChange(String(payload?.projectRoot || ''), {
      heading_anchor: String(payload?.headingAnchor || ''),
      block_id: String(payload?.blockId || ''),
      block_kind: String(payload?.blockKind || ''),
      block_text: String(payload?.blockText || ''),
      instruction: String(payload?.instruction || ''),
      expected_revision: Number(payload?.expectedRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:remove-plan-review-change', (_event, payload = {}) => (
    removePlanReviewChange(String(payload?.projectRoot || ''), {
      change_id: String(payload?.changeId || ''),
      expected_revision: Number(payload?.expectedRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:submit-plan-review-changes', (_event, payload = {}) => (
    beginPlanReviewRevision(String(payload?.projectRoot || ''), {
      expected_revision: Number(payload?.expectedRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:implement-managed-plan', (_event, payload = {}) => (
    implementManagedPlan(String(payload?.projectRoot || ''), {
      expected_revision: Number(payload?.expectedRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:answer-plan-direction', (_event, payload = {}) => (
    answerPlanDirectionQuestion(String(payload?.projectRoot || ''), {
      question_id: String(payload?.questionId || ''),
      answer: payload?.answer,
      expected_revision: Number(payload?.expectedRevision),
      expected_direction_revision: Number(payload?.expectedDirectionRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:change-plan-direction', (_event, payload = {}) => (
    changePlanDirection(String(payload?.projectRoot || ''), {
      feedback: String(payload?.feedback || ''),
      expected_revision: Number(payload?.expectedRevision),
      expected_direction_revision: Number(payload?.expectedDirectionRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:retry-plan-direction', (_event, payload = {}) => (
    retryPlanDirectionSynthesis(String(payload?.projectRoot || ''), {
      expected_revision: Number(payload?.expectedRevision),
      expected_direction_revision: Number(payload?.expectedDirectionRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
  ))
  handleVersioned(ipcMainImpl, 'documents:select-plan-authoring-profile', (_event, payload = {}) => {
    const result = selectPlanAuthoringProfile(String(payload?.projectRoot || ''), {
      selected_profile: String(payload?.selectedProfile || ''),
      expected_revision: Number(payload?.expectedRevision),
      expected_direction_revision: Number(payload?.expectedDirectionRevision),
    }, {
      threadId: String(payload?.threadId || ''),
      planId: String(payload?.planId || ''),
    })
    return { plan: result.plan, event: result.event }
  })
  handleVersioned(ipcMainImpl, 'documents:migrate-legacy-plan-state', (_event, payload = {}) => (
    migrateLegacyRendererPlanState(String(payload?.projectRoot || ''), payload?.legacyState, {
      threadId: String(payload?.threadId || ''),
    })
  ))
}
