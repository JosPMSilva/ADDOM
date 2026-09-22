import React from 'react'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import ActionButton from './ui/ActionButton.jsx'

class PanelErrorBoundaryInner extends React.Component {
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
      console.error('[ADDOM Renderer PanelErrorBoundary]', error, errorInfo)
    } catch {
      // Non-fatal.
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.panelKey !== this.props.panelKey) {
      this.setState({
        hasError: false,
        errorMessage: '',
      })
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
    })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { t } = this.props
    const panelLabel = String(this.props.panelLabel || t('core:errorBoundary.panel.fallbackLabel', {
      defaultValue: 'This panel',
    })).trim() || t('core:errorBoundary.panel.fallbackLabel', { defaultValue: 'This panel' })
    const technicalError = this.state.errorMessage || t('core:errorBoundary.panel.unexpected', {
      defaultValue: 'Unexpected panel error',
    })
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface p-6">
        <div className="w-full max-w-md rounded-xl bg-surface-raised px-5 py-4 shadow-[0_16px_42px_rgb(var(--theme-shadow-rgb)_/_0.22)]">
          <p className="font-display text-[11px] font-medium text-danger-soft">
            {t('core:errorBoundary.panel.eyebrow', { defaultValue: 'Panel error' })}
          </p>
          <h2 className="mt-1.5 font-display text-sm font-semibold text-text-primary">
            {t('core:errorBoundary.panel.title', {
              defaultValue: '{{panelLabel}} could not be displayed.',
              panelLabel,
            })}
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-text-secondary">
            {t('core:errorBoundary.panel.description', {
              defaultValue: 'Retry this panel to restore it. Your project and thread data are unchanged.',
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
              onClick={this.handleRetry}
            >
              {t('core:errorBoundary.panel.retry', { defaultValue: 'Retry panel' })}
            </ActionButton>
          </div>
        </div>
      </div>
    )
  }
}

export default function PanelErrorBoundary(props) {
  const { t } = useRendererTranslation(['core'])
  return <PanelErrorBoundaryInner {...props} t={t} />
}
