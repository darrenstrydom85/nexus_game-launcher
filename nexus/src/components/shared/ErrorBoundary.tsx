import * as React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Bug } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <AlertTriangle className="size-10 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <div className="flex gap-2">
            <Button
              data-testid="error-retry"
              variant="secondary"
              className="gap-1"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw className="size-4" /> Try Again
            </Button>
            <Button
              data-testid="error-report"
              variant="ghost"
              className="gap-1"
              asChild
            >
              <a href="https://discord.gg/dh2tDGJNYD" target="_blank" rel="noopener noreferrer">
                <Bug className="size-4" /> Report Bug
              </a>
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
