import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { asTrimmedString } from './chat-terminal-dock-utils.mjs'

export function PendingApprovalViewport({ approval = null }) {
  const { t } = useRendererTranslation(['core'])
  const cwd = asTrimmedString(approval?.toolInput?.cwd || approval?.policy?.resolvedCwd || approval?.projectRoot)
  const scope = approval?.policy?.hostAccessRequired === true
    ? t('core:terminal.pendingApproval.scopeHost', { defaultValue: 'Host access' })
    : t('core:terminal.pendingApproval.scopeWorkspace', { defaultValue: 'Workspace' })
  return (
    <section
      className="flex h-full min-h-0 flex-col px-4 py-4"
      data-ui="chat-terminal-dock-pending"
      aria-label={t('core:terminal.pendingApproval.title', { defaultValue: 'Terminal waiting for approval' })}
    >
      <div>
        <p className="text-sm font-semibold text-text-primary">
          {t('core:terminal.pendingApproval.title', { defaultValue: 'Terminal waiting for approval' })}
        </p>
      </div>
      <div className="mt-4 flex-1">
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
            <p className="text-text-tertiary">
              {t('core:terminal.pendingApproval.scopeLabel', { defaultValue: 'Scope' })}
            </p>
            <p className="text-text-secondary">{scope}</p>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
            <p className="text-text-tertiary">
              {t('core:terminal.pendingApproval.directoryLabel', { defaultValue: 'Directory' })}
            </p>
            <p className="break-all font-mono text-text-secondary">
              {cwd || t('core:terminal.pendingApproval.workspaceRoot', { defaultValue: 'workspace root' })}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
