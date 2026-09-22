import React from 'react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import ActionButton from './ui/ActionButton.jsx'

class AppErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      errorMessage: '',
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: String(error?.message || ''),
    }
  }

  componentDidCatch(error, errorInfo) {
    try {
      console.error('[ADDOM Renderer ErrorBoundary]', error, errorInfo)
    } catch {
      // Non-fatal.
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { t } = this.props
    const technicalError = this.state.errorMessage || t('core:errorBoundary.app.unexpected', {
      defaultValue: 'Unexpected renderer error',
    })
    return (
      <div className="min-h-screen w-full bg-surface text-text-primary flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl bg-surface-raised px-5 py-4 shadow-[0_16px_42px_rgb(var(--theme-shadow-rgb)_/_0.25)]">
          <p className="font-display text-[11px] font-medium text-danger-soft">
            {t('core:errorBoundary.app.eyebrow', { defaultValue: 'Renderer error' })}
          </p>
          <h1 className="mt-1.5 font-display text-base font-semibold text-text-primary">
            {t('core:errorBoundary.app.title', { defaultValue: "ADDOM couldn't display this screen." })}
          </h1>
          <p className="mt-1.5 text-xs leading-5 text-text-secondary">
            {t('core:errorBoundary.app.description', {
              defaultValue: 'Reload the app to restore the workspace. Your local project data is unchanged.',
            })}
          </p>
          <details className="mt-2 text-[11px] text-text-muted">
            <summary className="cursor-pointer rounded-sm font-display text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong">
              {t('core:errorBoundary.technicalDetails', { defaultValue: 'Technical details' })}
            </summary>
            <p className="mt-1.5 max-h-24 overflow-auto break-words font-mono leading-4 text-text-muted">{technicalError}</p>
          </details>
          <div className="mt-4 flex items-center gap-2">
            <ActionButton
              variant="primary"
              onClick={() => window.location.reload()}
            >
              {t('core:errorBoundary.app.reload', { defaultValue: 'Reload ADDOM' })}
            </ActionButton>
          </div>
        </div>
      </div>
    )
  }
}

export default function AppErrorBoundary(props) {
  const { t } = useRendererTranslation(['core'])
  return <AppErrorBoundaryInner {...props} t={t} />
}
