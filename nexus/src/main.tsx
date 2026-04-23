import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/geist-sans/300.css";
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/400.css";
import "./globals.css";
import { applyPersistedThemeClassSync } from "./lib/theme";
import App from "./App";
import { PopoutPlayer } from "./components/Twitch/PopoutPlayer";

applyPersistedThemeClassSync();

/**
 * Lightweight pathname-based router. We don't need react-router for a single
 * extra surface; the pop-out window is loaded with `WebviewUrl::App("/popout-player?...")`
 * by the Rust `popout_stream` command, so we just inspect `location.pathname`
 * here and mount the appropriate root.
 */
function Root() {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/popout-player")) {
    return <PopoutPlayer />;
  }
  return <App />;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: "#ef4444", background: "#0a0a0f", minHeight: "100vh", fontFamily: "monospace" }}>
          <h1>App crashed</h1>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, color: "#888", fontSize: 12 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
