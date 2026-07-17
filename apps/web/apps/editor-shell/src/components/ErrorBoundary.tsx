import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("EditorLayout error:", error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            fontFamily: "system-ui, sans-serif",
            color: "#666",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h2 style={{ color: "#c00", marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, marginBottom: 4 }}>
            {this.state.error?.message ?? "An unexpected error occurred"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "8px 24px",
              background: "#2ecc71",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
