import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Life Dashboard] render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "system-ui", color: "#e2e8f0", background: "#0f172a", minHeight: "100vh" }}>
          <h2 style={{ marginTop: 0 }}>Life Dashboard failed to load</h2>
          <p style={{ color: "#94a3b8" }}>
            {this.state.error.message}
          </p>
          {this.state.error.stack && (
            <details style={{ marginTop: "1rem", color: "#64748b", fontSize: "0.8rem" }}>
              <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>Technical details</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "#1e293b",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  maxHeight: "240px",
                  overflow: "auto",
                }}
              >
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: "1rem" }}>
            If you opened a dev build from Finder, run{" "}
            <code>npm run tauri:dev</code> from the project folder instead.
            For a normal double-click app, run <code>npm run app:open</code> once to build it.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
