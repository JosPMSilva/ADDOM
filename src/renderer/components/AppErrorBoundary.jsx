import React from 'react'

export default class AppErrorBoundary extends React.Component {
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
      errorMessage: String(error?.message || 'Unexpected renderer error'),
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

    return (
      <div className="min-h-screen w-full bg-surface text-text-primary flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-danger-border bg-surface-raised p-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-danger-soft">Renderer Error</p>
          <h1 className="mt-2 text-lg font-semibold text-danger-softer">ADDOM encountered an unexpected UI error.</h1>
          <p className="mt-2 text-sm text-text-subtle break-words">{this.state.errorMessage}</p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs rounded-lg border border-border-strong bg-surface-panel text-text-subtle hover:border-border-hover"
            >
              Reload App
            </button>
          </div>
        </div>
      </div>
    )
  }
}
