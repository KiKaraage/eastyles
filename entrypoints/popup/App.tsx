import { useState } from "react";
import { withErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useTheme } from "../../hooks/useTheme";
import { usePopupActions } from "../../hooks/useMessage";
import { useError } from "../../hooks/useError";
import { useSettings } from "../../hooks/useStorage";

interface PopupState {
  isLoading: boolean;
}

const App = () => {
  const [state, setState] = useState<PopupState>({
    isLoading: false,
  });

  // Theme management
  const { themeMode, effectiveTheme, isDark, setThemeMode, toggleTheme } =
    useTheme();

  // Message passing
  const { openManager, addNewStyle, openSettings } = usePopupActions();

  // Error handling
  const { executeWithErrorHandling } = useError();

  // Settings
  const { settings, updateSettings } = useSettings();

  // Enhanced navigation handlers with error handling
  const handleOpenManager = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    await executeWithErrorHandling(
      async () => {
        await openManager();
      },
      {
        errorMessage: "Failed to open manager page",
        errorType: "MESSAGE_ERROR" as any,
        severity: "MEDIUM" as any,
        recoverable: true,
        action: {
          label: "Retry",
          callback: handleOpenManager,
        },
      },
    ).finally(() => {
      setState((prev) => ({ ...prev, isLoading: false }));
    });
  };

  const handleAddNewStyle = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    await executeWithErrorHandling(
      async () => {
        await addNewStyle();
      },
      {
        errorMessage: "Failed to open style creation dialog",
        errorType: "MESSAGE_ERROR" as any,
        severity: "MEDIUM" as any,
        recoverable: true,
        action: {
          label: "Retry",
          callback: handleAddNewStyle,
        },
      },
    ).finally(() => {
      setState((prev) => ({ ...prev, isLoading: false }));
    });
  };

  const handleOpenSettings = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    await executeWithErrorHandling(
      async () => {
        await openSettings();
      },
      {
        errorMessage: "Failed to open settings",
        errorType: "MESSAGE_ERROR" as any,
        severity: "MEDIUM" as any,
        recoverable: true,
        action: {
          label: "Retry",
          callback: handleOpenSettings,
        },
      },
    ).finally(() => {
      setState((prev) => ({ ...prev, isLoading: false }));
    });
  };

  // Theme toggle handler
  const handleToggleTheme = async () => {
    await executeWithErrorHandling(
      async () => {
        await toggleTheme();
      },
      {
        errorMessage: "Failed to toggle theme",
        errorType: "STORAGE_ERROR" as any,
        severity: "LOW" as any,
        recoverable: true,
      },
    );
  };

  return (
    <div className="bg-base-100 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-base-200 p-4 border-b border-base-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/logo.svg" alt="Eastyles logo" className="w-8 h-8" />
            <h3 className="text-lg font-bold text-base-content">
              Styles for...
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-xs text-base-content/50">v1.0.0</div>
            <button
              onClick={handleToggleTheme}
              className="btn btn-ghost btn-xs"
              title={`Current theme: ${themeMode} (${effectiveTheme})`}
            >
              {isDark ? (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-2">
        {state.isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="loading loading-spinner loading-lg"></div>
            <p className="text-base-content/70">Loading...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleOpenManager}
                className="btn btn-primary w-full justify-start normal-case"
              >
                <svg
                  className="w-5 h-5 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
                Manage Styles
              </button>

              <button
                onClick={handleAddNewStyle}
                className="btn btn-secondary w-full justify-start normal-case"
              >
                <svg
                  className="w-5 h-5 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add New Style
              </button>

              <button
                onClick={handleOpenSettings}
                className="btn btn-ghost w-full justify-start normal-case"
              >
                <svg
                  className="w-5 h-5 mr-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Settings
              </button>
            </div>

            {/* Quick Stats - Using DaisyUI stats component */}
            <div className="stats shadow">
              <div className="stat place-items-center">
                <div className="stat-title">Active Styles</div>
                <div className="stat-value text-primary">0</div>
                <div className="stat-desc">Total managed styles</div>
              </div>

              <div className="stat place-items-center">
                <div className="stat-title">Total Styles</div>
                <div className="stat-value text-secondary">0</div>
                <div className="stat-desc">All created styles</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const AppWithErrorBoundary = withErrorBoundary(App);

export default AppWithErrorBoundary;
