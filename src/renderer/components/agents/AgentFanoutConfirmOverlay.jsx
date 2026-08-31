import React from 'react'
import useChatStore from '../../store/useChatStore.js'
import {
  buildFanoutConfirmViewModel,
  FANOUT_CONFIRM_DECISIONS,
} from './agent-fanout-confirm-view-model.mjs'
import { DIALOG_Z_ELEVATED } from '../dialog-layering.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function AgentFanoutConfirmOverlay() {
  const { t } = useRendererTranslation(['core'])
  const request = useChatStore((state) => state.agentFanoutConfirmRequest)
  const clearRequest = useChatStore((state) => state.clearAgentFanoutConfirmRequest)
  const viewModel = buildFanoutConfirmViewModel(request)
  const dialogRef = React.useRef(null)
  useDialogFocusTrap(!!viewModel, dialogRef)

  if (!viewModel) return null

  const submit = (decision) => {
    window.addom.agents.respondFanoutConfirm(viewModel.requestId, decision)
    clearRequest(request?.threadId)
  }

  const title = t('core:agents.fanoutConfirmation.title', {
    defaultValue: 'Launch {{count}} agents?',
    count: viewModel.requestedCount,
  })

  return (
    <div className={`fixed inset-0 ${DIALOG_Z_ELEVATED} flex items-center justify-center bg-overlay-scrim-strong px-4`}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-fanout-confirm-title"
        aria-describedby="agent-fanout-confirm-description"
        className="w-full max-w-md rounded-2xl bg-surface-raised px-4 py-4 shadow-2xl"
        data-ui="agent-fanout-confirmation"
      >
        <h3 id="agent-fanout-confirm-title" className="text-sm font-semibold text-text-primary">
          {title}
        </h3>
        <p id="agent-fanout-confirm-description" className="mt-1 text-xs leading-5 text-text-secondary">
          {t('core:agents.fanoutConfirmation.description', {
            defaultValue: 'The orchestrator requested more agents than your {{limit}}-agent confirmation limit.',
            limit: viewModel.threshold,
          })}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => submit(FANOUT_CONFIRM_DECISIONS.stopTurn)}
            className="min-h-8 rounded-md px-3 text-xs text-danger-soft hover:bg-danger-bg"
          >
            {t('core:agents.fanoutConfirmation.stopTurn', { defaultValue: 'Stop turn' })}
          </button>
          <button
            type="button"
            onClick={() => submit(FANOUT_CONFIRM_DECISIONS.limit)}
            className="min-h-8 rounded-md bg-surface-panel px-3 text-xs text-text-primary hover:bg-surface-panel-alt"
          >
            {t('core:agents.fanoutConfirmation.limit', {
              defaultValue: 'Limit to {{count}}',
              count: viewModel.threshold,
            })}
          </button>
          <button
            type="button"
            onClick={() => submit(FANOUT_CONFIRM_DECISIONS.launchAll)}
            className="min-h-8 rounded-md bg-accent px-3 text-xs font-semibold text-surface hover:bg-accent-hover"
          >
            {t('core:agents.fanoutConfirmation.launch', {
              defaultValue: 'Launch {{count}}',
              count: viewModel.requestedCount,
            })}
          </button>
        </div>
      </div>
    </div>
  )
}
