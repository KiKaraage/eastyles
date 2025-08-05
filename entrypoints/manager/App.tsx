import React, { useState, useEffect } from "react";
import Settings from "../../components/features/Settings";
import { useTheme } from "../../hooks/useTheme";
import { Brightness, MoonSat, Computer } from "iconoir-react";

const ManageStyles = () => <div>Manage Styles Content</div>;

const App = () => {
  const { themeMode, effectiveTheme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("manage-styles");

  // Handle URL hash-based navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove the '#' symbol
      if (hash === "styles" || hash === "manage-styles") {
        setActiveTab("manage-styles");
      } else if (hash === "settings") {
        setActiveTab("settings");
      }
    };

    // Initial check
    handleHashChange();

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange);

    // Cleanup
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return (
    <div className="bg-base-100 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-base-200 p-4 border-b border-base-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/logo.svg" alt="Eastyles logo" className="w-8 h-8" />
          </div>
          <div role="tablist" className="tabs tabs-lifted">
            <button
              role="tab"
              className={`tab ${activeTab === "manage-styles" ? "tab-active" : ""}`}
              onClick={() => {
                setActiveTab("manage-styles");
                window.location.hash = "styles";
              }}
            >
              Manage Styles
            </button>
            <button
              role="tab"
              className={`tab ${activeTab === "settings" ? "tab-active" : ""}`}
              onClick={() => {
                setActiveTab("settings");
                window.location.hash = "settings";
              }}
            >
              Settings
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-xs text-base-content/50">v1.0.0</div>
            <button
              onClick={toggleTheme}
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
      <div className="flex-1 p-4">
        <div className="mt-4">
          {activeTab === "manage-styles" && <ManageStyles />}
          {activeTab === "settings" && <Settings />}
        </div>
      </div>
    </div>
  );
};

export default App;
