import React from "react";
import {
  errorService,
  ErrorSource,
  ExtensionError,
  ErrorSeverity,
} from "../../services/errors/service";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  isolate?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo: React.ErrorInfo;
  retry: () => void;
  canRetry: boolean;
  resetError: () => void;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private readonly maxRetries = 3;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Report to error service
    const extensionError = errorService.handleError(error, {
      source: ErrorSource.POPUP,
      errorInfo,
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
    });

    // Auto-retry for non-fatal errors
    if (
      extensionError instanceof ExtensionError &&
      extensionError.severity !== ErrorSeverity.FATAL &&
      this.state.retryCount < this.maxRetries
    ) {
      this.scheduleRetry();
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private scheduleRetry = () => {
    const retryDelay = Math.min(
      1000 * Math.pow(2, this.state.retryCount),
      5000,
    );

    this.retryTimeoutId = setTimeout(() => {
      this.setState((prevState) => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
      }));
    }, retryDelay);
  };

  private handleRetry = () => {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }

    this.setState((prevState) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    });
  };

  private renderFallback() {
    const { error, errorInfo, retryCount } = this.state;
    const { fallback: CustomFallback } = this.props;

    if (!error || !errorInfo) return null;

    const canRetry = retryCount < this.maxRetries;

    if (CustomFallback) {
      return (
        <CustomFallback
          error={error}
          errorInfo={errorInfo}
          retry={this.handleRetry}
          canRetry={canRetry}
          resetError={this.handleReset}
        />
      );
    }

    // Determine error severity for UI styling
    const extensionError = error instanceof ExtensionError ? error : null;
    const isFatal = extensionError?.severity === ErrorSeverity.FATAL;

    return (
      <div
        className={`bg-base-200 p-4 rounded-box w-full text-center ${this.props.isolate ? "border-2 border-error/20" : ""}`}
      >
        <div className="flex flex-col items-center gap-3">
          {/* Error Icon */}
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${isFatal ? "bg-error/20" : "bg-warning/20"}`}
          >
            <svg
              className={`w-6 h-6 ${isFatal ? "text-error" : "text-warning"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>

          {/* Error Message */}
          <div>
            <h3
              className={`text-lg font-bold ${isFatal ? "text-error" : "text-warning"}`}
            >
              {isFatal ? "Critical Error" : "Something went wrong"}
            </h3>
            <p className="text-sm text-base-content/70 mt-1">
              {isFatal
                ? "A critical error occurred that requires attention."
                : retryCount > 0
                  ? `Error occurred (attempt ${retryCount + 1}/${this.maxRetries + 1})`
                  : "A technical error occurred. We've automatically reported it."}
            </p>
          </div>

          {/* Error Details (Development Mode) */}
          {process.env.NODE_ENV === "development" && (
            <details className="w-full">
              <summary className="text-xs text-base-content/50 cursor-pointer hover:text-base-content/70">
                Error Details
              </summary>
              <div className="mt-2 p-2 bg-base-300 rounded text-xs text-left font-mono overflow-auto max-h-32">
                <div className="text-error font-bold">
                  {error.name}: {error.message}
                </div>
                {error.stack && (
                  <pre className="mt-1 text-base-content/70 whitespace-pre-wrap">
                    {error.stack.split("\n").slice(0, 5).join("\n")}
                  </pre>
                )}
              </div>
            </details>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap justify-center">
            {canRetry && !isFatal && (
              <button
                className="btn btn-sm btn-primary"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
            )}

            <button
              className="btn btn-sm btn-outline"
              onClick={this.handleReset}
            >
              Reset
            </button>

            {isFatal && (
              <button
                className="btn btn-sm btn-error"
                onClick={() => window.location.reload()}
              >
                Reload Extension
              </button>
            )}
          </div>

          {/* Retry Status */}
          {retryCount > 0 && (
            <div className="text-xs text-base-content/50">
              {retryCount >= this.maxRetries
                ? "Maximum retry attempts reached"
                : `Retried ${retryCount} time${retryCount > 1 ? "s" : ""}`}
            </div>
          )}
        </div>
      </div>
    );
  }

  render() {
    if (this.state.hasError) {
      return this.renderFallback();
    }
    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, "children">,
) {
  const displayName =
    WrappedComponent.displayName || WrappedComponent.name || "Component";

  const WrappedWithErrorBoundary = class extends React.Component<P> {
    static displayName = `withErrorBoundary(${displayName})`;

    render() {
      return (
        <ErrorBoundary {...errorBoundaryProps} isolate>
          <WrappedComponent {...this.props} />
        </ErrorBoundary>
      );
    }
  };

  return WrappedWithErrorBoundary;
}

// Export default fallback component
export const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  retry,
  canRetry,
  resetError,
}) => (
  <div className="bg-base-200 p-6 rounded-box w-full text-center">
    <h3 className="text-lg font-bold text-error mb-2">Something went wrong</h3>
    <p className="text-sm text-base-content/70 mb-4">
      {error.message || "An unexpected error occurred"}
    </p>
    <div className="flex gap-2 justify-center">
      {canRetry && (
        <button className="btn btn-sm btn-primary" onClick={retry}>
          Try Again
        </button>
      )}
      <button className="btn btn-sm btn-outline" onClick={resetError}>
        Reset
      </button>
    </div>
  </div>
);

export default ErrorBoundary;
