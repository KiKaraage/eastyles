import { useState } from "react";
import { withErrorBoundary } from "../../components/ui/ErrorBoundary";
import { browser } from "wxt/browser";
import { List, Plus, Settings } from "iconoir-react";
import { useTheme } from "../../hooks/useTheme";

interface PopupState {
  isLoading: boolean;
}

const App = () => {
  const [state, setState] = useState<PopupState>({
    isLoading: false,
  });

  // Theme hook to sync with user's preference from settings
  const { isDark } = useTheme();

  // Helper function to close popup
  // Using window.close() directly as it's supported in extension popups across browsers
  const closePopup = () => {
    window.close();
  };

  // Direct navigation handler for manager page (styles tab)
  const handleOpenManager = async () => {
    try {
      // Open manager page with styles tab
      await browser.tabs.create({ url: "/manager.html#styles" });
      closePopup();
    } catch (error) {
      console.error("Failed to open manager page:", error);
    }
  };

  // Direct navigation handler for settings
  const handleOpenSettings = async () => {
    try {
      // Open manager page with settings tab
      await browser.tabs.create({ url: "/manager.html#settings" });
      closePopup();
    } catch (error) {
      console.error("Failed to open settings page:", error);
    }
  };

  const handleAddNewStyle = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    // TODO: Implement add new style functionality
    console.log("Add new style clicked - implementation needed");
    setState((prev) => ({ ...prev, isLoading: false }));
  };

  return (
    <div className="bg-base-100 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-base-200 p-4 border-b border-base-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className="h-8 w-8 bg-current"
              style={{
                WebkitMask: "url(/logo.svg) no-repeat center",
                WebkitMaskSize: "contain",
                mask: "url(/logo.svg) no-repeat center",
                maskSize: "contain",
              }}
              aria-hidden="true"
            />
            <h3 className="text-lg font-bold text-base-content">
              Styles for...
            </h3>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 p-2 overflow-y-auto ${isDark ? "dark" : ""}`}>
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
      <div
        className={`bg-base-200 border-t border-base-300 p-2 ${isDark ? "dark" : ""}`}
      >
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
