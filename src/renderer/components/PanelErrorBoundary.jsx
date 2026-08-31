import React from 'react'

export default class PanelErrorBoundary extends React.Component {
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
      errorMessage: String(error?.message || 'Unexpected panel error'),
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

    const panelLabel = String(this.props.panelLabel || 'This panel').trim() || 'This panel'
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface p-6">
        <div className="w-full max-w-lg rounded-2xl border border-danger-border bg-surface-raised p-5">
          <p className="text-[11px] uppercase tracking-[0.14em] text-danger-soft">Panel Error</p>
          <h2 className="mt-2 text-base font-semibold text-danger-softer">{panelLabel} encountered an error.</h2>
          <p className="mt-2 text-sm text-text-subtle break-words">{this.state.errorMessage}</p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-3 py-1.5 text-xs rounded-lg border border-border-strong bg-surface-panel text-text-subtle hover:border-border-hover"
            >
              Retry Panel
            </button>
          </div>
        </div>
      </div>
    )
  }
}
