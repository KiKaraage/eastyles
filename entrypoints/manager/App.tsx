import { useState, useEffect } from "react";
import Settings from "../../components/features/Settings";
import { useTheme } from "../../hooks/useTheme";
import { SunLight, HalfMoon, Computer } from "iconoir-react";
import pkg from "../../package.json";

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
            {/* Themed SVG Logo using mask */}
            <div
              className="h-8 w-24 bg-current"
              style={{
                WebkitMask: "url(/eastyles-logotype.svg) no-repeat center",
                WebkitMaskSize: "contain",
                mask: "url(/eastyles-logotype.svg) no-repeat center",
                maskSize: "contain",
              }}
              aria-hidden="true"
            />
          </div>
          <div role="tablist" className="tabs tabs-lifted">
            <button
              role="tab"
              className={`tab font-bold relative transition-all duration-200 ${
                activeTab === "manage-styles" ? "tab-active" : ""
              }`}
              onClick={() => {
                setActiveTab("manage-styles");
                window.location.hash = "styles";
              }}
              style={{
                paddingBottom: "0.5rem",
              }}
            >
              Manage Styles
              <span
                className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 h-0.5 rounded-full transition-all duration-200 ${
                  activeTab === "manage-styles"
                    ? "w-3/5 bg-primary"
                    : "w-1/3 hover:w-3/5"
                }`}
              />
            </button>
            <button
              role="tab"
              className={`tab font-bold relative transition-all duration-200 ${
                activeTab === "settings" ? "tab-active" : ""
              }`}
              onClick={() => {
                setActiveTab("settings");
                window.location.hash = "settings";
              }}
              style={{
                paddingBottom: "0.5rem",
              }}
            >
              Settings
              <span
                className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 h-0.5 rounded-full transition-all duration-200 ${
                  activeTab === "settings"
                    ? "w-3/5 bg-primary"
                    : "w-1/3 hover:w-3/5"
                }`}
              />
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-xs text-base-content/50">v{pkg.version}</div>
            <button
              onClick={toggleTheme}
              className="btn btn-ghost btn-xs"
              title={`Current theme: ${themeMode} (${effectiveTheme})`}
            >
              {themeMode === "light" ? (
                <SunLight className="w-4 h-4" />
              ) : themeMode === "dark" ? (
                <HalfMoon className="w-4 h-4" />
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
