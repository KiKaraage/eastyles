import React from "react";
import { errorService, ErrorSource } from "../../services/errors/service";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    errorService.handleError(error, { source: ErrorSource.POPUP, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-base-200 p-4 rounded-box w-full text-center">
          <h3 className="text-lg font-bold text-error">
            Oops! Something went wrong.
          </h3>
          <p className="text-sm text-base-content my-2">
            A technical error occurred. We've automatically reported it.
          </p>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
) {
  return class extends React.Component<P> {
    render() {
      return (
        <ErrorBoundary>
          <WrappedComponent {...this.props} />
        </ErrorBoundary>
      );
    }
  };
}
