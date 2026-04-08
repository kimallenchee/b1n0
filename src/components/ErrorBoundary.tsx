import { Component, type ReactNode } from 'react'
import { logger } from '../lib/logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Catches rendering errors in child components and shows a friendly fallback
 * instead of crashing the entire app.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeRouteOrComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('React render crash', {
      error,
      componentStack: info.componentStack,
      message: error.message,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '300px',
            padding: '24px',
            textAlign: 'center',
            fontFamily: '"DM Sans", sans-serif',
          }}
        >
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>:(</p>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#f2efea', marginBottom: '8px' }}>
            Algo sali&oacute; mal
          </p>
          <p style={{ fontSize: '13px', color: '#5e5a54', marginBottom: '20px', maxWidth: '320px' }}>
            Ocurri&oacute; un error inesperado. Recarg&aacute; la p&aacute;gina para continuar.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px',
              borderRadius: '10px',
              border: 'none',
              background: '#4ade80',
              color: '#fff',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
