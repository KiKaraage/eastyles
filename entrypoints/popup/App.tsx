import { useState, useEffect } from "react";
import { withErrorBoundary } from "../../components/ui/ErrorBoundary";
import { browser } from "wxt/browser";
import { List, Plus, Settings } from "iconoir-react";
import { useTheme } from "../../hooks/useTheme";
import { useI18n } from "../../hooks/useI18n";
import ApplyFont from "./ApplyFont";
import { VariableControls } from "../../components/features/VariableControls";
import { useMessage, PopupMessageType } from "../../hooks/useMessage";
import { UserCSSStyle } from "../../services/storage/schema";

interface PopupState {
  isLoading: boolean;
  showFontSelector: boolean;
  currentTab: { url?: string; title?: string } | null;
  availableStyles: UserCSSStyle[];
  activeStyles: UserCSSStyle[];
  expandedStyleId: string | null;
}

const App = () => {
  const [state, setState] = useState<PopupState>({
    isLoading: false,
    showFontSelector: false,
    currentTab: null,
    availableStyles: [],
    activeStyles: [],
    expandedStyleId: null,
  });

  // Theme hook to sync with user's preference from settings
  const { isDark } = useTheme();

  // Internationalization hook
  const { t } = useI18n();

  // Message hook for communicating with background
  const { sendMessage } = useMessage();

  // Load styles and current tab info on popup open
  useEffect(() => {
    console.log("[Popup] useEffect running, loading popup data...");
    const loadPopupData = async () => {
      try {
        console.log("[Popup] Setting loading state...");
        setState((prev) => ({ ...prev, isLoading: true }));

        // Get current active tab
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        const currentTab = tabs[0];
        console.log("[Popup] Current tab:", currentTab);

        let tabUrl = "current-site";
        let tabTitle = "Current Site";

        if (currentTab) {
          // Try to get URL from tab object first
          if (currentTab.url) {
            // Handle different URL types
            if (currentTab.url.startsWith("http")) {
              tabUrl = currentTab.url;
              tabTitle = currentTab.title || tabUrl;
            } else if (
              currentTab.url.startsWith("chrome://") ||
              currentTab.url.startsWith("about:")
            ) {
              // Special pages like chrome://extensions, about:blank, etc.
              tabUrl = currentTab.url;
              tabTitle = currentTab.title || "Browser Page";
            } else if (currentTab.url.startsWith("chrome-extension://")) {
              // Extension pages
              tabUrl = currentTab.url;
              tabTitle = currentTab.title || "Extension Page";
            } else {
              // Other restricted URLs
              tabUrl = "restricted-url";
              tabTitle = currentTab.title || "Restricted Page";
            }
          }

          setState((prev) => ({
            ...prev,
            currentTab: {
              url: tabUrl,
              title: tabTitle,
            },
          }));

          // Query for styles that match the current URL
          console.log("[Popup] Attempting to get styles for URL:", tabUrl);
          console.log("[Popup] tabUrl type:", typeof tabUrl);
          console.log(
            "[Popup] tabUrl === 'current-site':",
            tabUrl === "current-site",
          );
          console.log(
            "[Popup] Boolean check result:",
            tabUrl && tabUrl !== "current-site",
          );
          try {
            let availableStyles: UserCSSStyle[] = [];

            if (
              tabUrl &&
              tabUrl !== "current-site" &&
              tabUrl !== "restricted-url"
            ) {
              // Query styles for specific URL through background script
              console.log("[Popup] Using QUERY_STYLES_FOR_URL for:", tabUrl);
              const response = await sendMessage(
                PopupMessageType.QUERY_STYLES_FOR_URL,
                { url: tabUrl },
              );
              console.log("[Popup] QUERY_STYLES_FOR_URL response:", response);
              console.log("[Popup] Response type:", typeof response);
              console.log("[Popup] Response.success:", response?.success);
              console.log(
                "[Popup] Response.styles length:",
                response?.styles?.length,
              );
              if (
                response &&
                typeof response === "object" &&
                response.success &&
                response.styles
              ) {
                availableStyles = response.styles as UserCSSStyle[];
              } else {
                console.warn(
                  "[Popup] QUERY_STYLES_FOR_URL failed, falling back to GET_STYLES",
                );
                // Fallback to all styles if domain query fails
                const fallbackResponse = await sendMessage(
                  PopupMessageType.GET_STYLES,
                  {},
                );
                if (
                  fallbackResponse &&
                  typeof fallbackResponse === "object" &&
                  fallbackResponse.styles
                ) {
                  availableStyles = fallbackResponse.styles as UserCSSStyle[];
                }
              }
            } else {
              // Fallback: get all styles if URL not available
              console.log(
                "[Popup] Using GET_STYLES fallback (no URL or current-site)",
              );
              const response = await sendMessage(
                PopupMessageType.GET_STYLES,
                {},
              );
              console.log("[Popup] GET_STYLES response:", response);
              console.log("[Popup] GET_STYLES response type:", typeof response);
              if (response && typeof response === "object" && response.styles) {
                availableStyles = response.styles as UserCSSStyle[];
              }
            }

            console.log(
              "[Popup] Setting available styles:",
              availableStyles.length,
              "active:",
              availableStyles.filter((style) => style.enabled).length,
            );
            setState((prev) => ({
              ...prev,
              availableStyles,
              activeStyles: availableStyles.filter((style) => style.enabled),
            }));
          } catch (error) {
            console.error("[Popup] Failed to get styles:", error);
          }
        }
      } catch (error) {
        console.error("[Popup] Failed to load popup data:", error);
      } finally {
        console.log("[Popup] Finished loading, setting loading to false");
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    loadPopupData();
  }, [sendMessage]);

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

  const handleOpenFontSelector = () => {
    setState((prev) => ({ ...prev, showFontSelector: true }));
  };

  const handleCloseFontSelector = () => {
    setState((prev) => ({ ...prev, showFontSelector: false }));
  };

  const handleFontApplied = (application: unknown) => {
    console.log("Font applied:", application);
    // TODO: Handle successful font application
  };

  const handleToggleStyle = async (styleId: string, enabled: boolean) => {
    try {
      await sendMessage(PopupMessageType.TOGGLE_STYLE, {
        id: styleId,
        enabled,
      });

      // Update local state
      setState((prev) => ({
        ...prev,
        availableStyles: prev.availableStyles.map((style) =>
          style.id === styleId ? { ...style, enabled } : style,
        ),
        activeStyles: enabled
          ? [
              ...prev.activeStyles,
              prev.availableStyles.find((s) => s.id === styleId)!,
            ].filter(Boolean)
          : prev.activeStyles.filter((style) => style.id !== styleId),
      }));
    } catch (error) {
      console.error("Failed to toggle style:", error);
    }
  };

  const handleToggleVariableExpansion = (styleId: string) => {
    setState((prev) => ({
      ...prev,
      expandedStyleId: prev.expandedStyleId === styleId ? null : styleId,
    }));
  };

  const handleVariableChange = async (
    styleId: string,
    variableName: string,
    value: string,
  ) => {
    try {
      // Update local state immediately for responsive UI
      setState((prev) => {
        const updatedAvailableStyles = prev.availableStyles.map((style) =>
          style.id === styleId
            ? {
                ...style,
                variables: {
                  ...style.variables,
                  [variableName]: {
                    ...style.variables[variableName],
                    value,
                  },
                },
              }
            : style,
        );
        return {
          ...prev,
          availableStyles: updatedAvailableStyles,
          activeStyles: updatedAvailableStyles.filter((style) => style.enabled),
        };
      });

      // Send message to update variables in storage and content script
      await sendMessage(PopupMessageType.UPDATE_VARIABLES, {
        styleId: styleId,
        variables: { [variableName]: value },
      });
    } catch (error) {
      console.error("Failed to update variable:", error);
    }
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
              {t("stylesFor")}{" "}
              {state.currentTab?.url
                ? (() => {
                    try {
                      if (state.currentTab.url === "current-site") {
                        return "current site";
                      }
                      if (state.currentTab.url === "restricted-url") {
                        return "restricted page";
                      }

                      const url = new URL(state.currentTab.url);
                      // Only remove 'www.' prefix, keep other subdomains
                      const hostname = url.hostname.replace(/^www\./, "");
                      return hostname;
                    } catch {
                      // For non-HTTP URLs, try to extract a meaningful name
                      if (state.currentTab.url.startsWith("chrome://")) {
                        return "Chrome page";
                      }
                      if (state.currentTab.url.startsWith("about:")) {
                        return "Browser page";
                      }
                      if (
                        state.currentTab.url.startsWith("chrome-extension://")
                      ) {
                        return "Extension page";
                      }
                      return "current site";
                    }
                  })()
                : "current site"}
            </h3>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 p-2 overflow-y-auto ${isDark ? "dark" : ""}`}>
        {state.isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="loading loading-spinner loading-lg"></div>
            <p className="text-base-content/70">{t("loading")}</p>
          </div>
        ) : (
          <div className="space-y-4 px-2">
            {/* Show available styles for this site */}
            {state.availableStyles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-base-content">
                  Available for this site:
                </h4>
                {state.availableStyles.map((style) => (
                  <div key={style.id} className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-medium text-base-content truncate">
                          {style.name}
                        </h5>
                        <p className="text-xs text-base-content/70 truncate">
                          {style.description}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Settings button for styles with variables - only for enabled styles */}
                        {Object.keys(style.variables).length > 0 &&
                          style.enabled && (
                            <button
                              onClick={() =>
                                handleToggleVariableExpansion(style.id)
                              }
                              className={`btn btn-ghost btn-sm ${state.expandedStyleId === style.id ? "btn-active" : ""}`}
                              title="Configure variables"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          )}
                        <button
                          onClick={() =>
                            handleToggleStyle(style.id, !style.enabled)
                          }
                          className={`btn btn-sm ${style.enabled ? "btn-success" : "btn-ghost"}`}
                        >
                          {style.enabled ? "Active" : "Enable"}
                        </button>
                      </div>
                    </div>

                    {/* Variable Controls */}
                    {state.expandedStyleId === style.id &&
                      Object.keys(style.variables).length > 0 &&
                      style.enabled && (
                        <div className="ml-4 p-3 bg-base-100 border border-base-300 rounded-lg">
                          <VariableControls
                            variables={Object.values(style.variables)}
                            onChange={(variableName, value) =>
                              handleVariableChange(
                                style.id,
                                variableName,
                                value,
                              )
                            }
                          />
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between">
              {/* Add New Style Button */}
              <button
                onClick={handleAddNewStyle}
                className="btn btn-secondary flex-1 justify-start normal-case"
              >
                <Plus className="w-5 h-5 mr-3 flex-shrink-0" />
                <span className="truncate">{t("addNewStyle")}</span>
              </button>

              {/* Apply Font Button */}
              <button
                onClick={handleOpenFontSelector}
                className="btn btn-primary flex-1 justify-start normal-case ml-2"
              >
                <span className="text-lg mr-3 flex-shrink-0">Aa</span>
                <span className="truncate">{t("font_applyButton")}</span>
              </button>
            </div>

            {/* Apply Font Modal */}
            {state.showFontSelector && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-base-100 rounded-lg shadow-xl max-w-md w-full">
                  <ApplyFont
                    onFontApplied={handleFontApplied}
                    onClose={handleCloseFontSelector}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer with Manage and Settings buttons */}
      <div
        className={`bg-base-200 border-t border-base-300 p-2 ${isDark ? "dark" : ""}`}
      >
        <div className="flex justify-between items-center">
          <button
            onClick={handleOpenManager}
            className="btn btn-ghost btn-sm normal-case flex-1 justify-start mr-2"
          >
            <List className="w-4 h-4 mr-2" />
            <span>{t("manageStyles")}</span>
          </button>

          <button
            onClick={handleOpenSettings}
            className="btn btn-ghost btn-sm normal-case flex-1 justify-start"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
            <span>{t("settings")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const AppWithErrorBoundary = withErrorBoundary(App) as React.ComponentType;

export default AppWithErrorBoundary;
