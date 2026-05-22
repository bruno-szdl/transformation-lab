import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'
import { safeStorage } from '../store/safeStorage'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ae-quest crashed:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    safeStorage.removeItem('ae-quest-progress')
    safeStorage.removeItem('ae-quest-seen-panels')
    safeStorage.removeItem('ae-quest-lang')
    safeStorage.removeItem('ae-quest-theme')
    // legacy keys from dbt-quest rebrand, harmless if absent
    safeStorage.removeItem('dbt-quest-store')
    safeStorage.removeItem('dbt-quest-progress')
    safeStorage.removeItem('dbt-quest-seen-panels')
    safeStorage.removeItem('dbt-quest-lang')
    safeStorage.removeItem('dbt-quest-theme')
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const t = i18n.t.bind(i18n)

    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-base, #0d1117)',
          color: 'var(--color-text, #e6edf3)',
          fontFamily: 'var(--font-sans)',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '520px', width: '100%' }}>
          <div
            style={{
              fontSize: '0.6875rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-orange, #ff694a)',
              marginBottom: '12px',
            }}
          >
            {t('errorBoundary.eyebrow')}
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 12px' }}>
            {t('errorBoundary.title')}
          </h1>
          <p style={{ color: 'var(--color-text-muted, #7d8590)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {t('errorBoundary.body')}
          </p>
          <pre
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
              background: 'var(--color-surface, #161b22)',
              border: '1px solid var(--color-border, #30363d)',
              padding: '12px',
              borderRadius: '6px',
              overflow: 'auto',
              maxHeight: '160px',
              margin: '0 0 16px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {this.state.error.message}
          </pre>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 14px',
                background: 'var(--color-accent-orange, #ff694a)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              {t('errorBoundary.reload')}
            </button>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                color: 'var(--color-text, #e6edf3)',
                border: '1px solid var(--color-border, #30363d)',
                borderRadius: '4px',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              {t('errorBoundary.reset')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
