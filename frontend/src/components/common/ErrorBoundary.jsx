import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('UI render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen bg-bg text-ink flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-bad/30 bg-panel/90 p-6 shadow-soft">
          <div className="text-[11px] uppercase tracking-widest text-bad mb-2">Interface error</div>
          <h1 className="font-display text-2xl font-semibold">This screen could not render.</h1>
          <p className="mt-3 text-sm text-muted">The app caught the failure instead of going blank. Refresh the page, then share the console error if it repeats.</p>
          <button onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Reload
          </button>
        </div>
      </div>
    )
  }
}
