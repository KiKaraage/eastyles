import { useState } from "react";
import { withErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useTheme } from "../../hooks/useTheme";
import { usePopupActions } from "../../hooks/useMessage";
import { useError, ErrorSeverity, PopupErrorType } from "../../hooks/useError";
import {
  Brightness,
  MoonSat,
  Computer,
  List,
  Plus,
  Settings,
} from "iconoir-react";

interface PopupState {
  isLoading: boolean;
}

const App = () => {
  const [state, setState] = useState<PopupState>({
    isLoading: false,
  });

  // Theme management
  const { themeMode, effectiveTheme, toggleTheme } = useTheme();

  // Message passing
  const { openManager, addNewStyle, openSettings } = usePopupActions();

  // Error handling
  const { executeWithErrorHandling } = useError();

  // Enhanced navigation handlers with error handling
  const handleOpenManager = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    await executeWithErrorHandling(
      async () => {
        await openManager();
        // Close popup after successfully opening manager
        window.close();
      },
      {
        errorMessage: "Failed to open manager page",
        errorType: PopupErrorType.MESSAGE_ERROR,
        severity: ErrorSeverity.MEDIUM,
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
        errorType: PopupErrorType.MESSAGE_ERROR,
        severity: ErrorSeverity.MEDIUM,
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
        // Close popup after successfully opening settings
        window.close();
      },
      {
        errorMessage: "Failed to open settings",
        errorType: PopupErrorType.MESSAGE_ERROR,
        severity: ErrorSeverity.MEDIUM,
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
        errorType: PopupErrorType.STORAGE_ERROR,
        severity: ErrorSeverity.LOW,
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
              {themeMode === "light" ? (
                <Brightness className="w-4 h-4" />
              ) : themeMode === "dark" ? (
                <MoonSat className="w-4 h-4" />
              ) : (
                <Computer className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-2 overflow-y-auto">
        {state.isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="loading loading-spinner loading-lg"></div>
            <p className="text-base-content/70">Loading...</p>
          </div>
        ) : (
          <div className="space-y-4 px-2">
            {/* Quick Stats - Using DaisyUI stats component */}
            <div className="stats shadow">
              <div className="stat place-items-center">
                <div className="stat-title text-xs">Active Styles</div>
                <div className="stat-value text-primary text-lg">0</div>
                <div className="stat-desc text-xs">Total managed styles</div>
              </div>

              <div className="stat place-items-center">
                <div className="stat-title text-xs">Total Styles</div>
                <div className="stat-value text-secondary text-lg">0</div>
                <div className="stat-desc text-xs">All created styles</div>
              </div>
            </div>

            {/* Add New Style Button - moved below stats */}
            <button
              onClick={handleAddNewStyle}
              className="btn btn-secondary w-full justify-start normal-case"
            >
              <Plus className="w-5 h-5 mr-3 flex-shrink-0" />
              <span className="truncate">Add New Style</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer with Manage and Settings */}
      <div className="bg-base-200 border-t border-base-300 p-2">
        <div className="flex justify-between items-center">
          <button
            onClick={handleOpenManager}
            className="btn btn-ghost btn-sm normal-case flex-1 justify-start mr-2"
          >
            <List className="w-4 h-4 mr-2" />
            <span>Manage</span>
          </button>

          <button
            onClick={handleOpenSettings}
            className="btn btn-ghost btn-sm normal-case flex-1 justify-start"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const AppWithErrorBoundary = withErrorBoundary(App) as React.ComponentType;

export default AppWithErrorBoundary;
