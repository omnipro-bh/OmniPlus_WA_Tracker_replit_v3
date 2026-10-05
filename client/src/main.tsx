import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// TEMP debug boundary (cbff9bc diagnosis) — will be reverted after capture.
class DebugBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Fire-and-forget POST to the temporary debug endpoint.
    fetch("/api/debug/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message ?? String(error),
        stack: error?.stack ?? "",
        componentStack: info?.componentStack ?? "",
      }),
    }).catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <div data-testid="client-error-boundary" style={{ padding: 24, fontFamily: "monospace", color: "#f00", background: "#fff" }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>CLIENT ERROR (debug boundary)</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{this.state.error.stack || this.state.error.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <DebugBoundary>
    <App />
  </DebugBoundary>
);
