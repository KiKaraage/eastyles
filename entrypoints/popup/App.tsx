import { useState, useEffect, useCallback } from "react";
import { withErrorBoundary } from "../../components/ui/ErrorBoundary";
import { browser } from "wxt/browser";
import {
  TextSize,
  Settings,
  ArrowLeft,
  Check,
  Palette,
  ViewGrid,
} from "iconoir-react";
import { useTheme } from "../../hooks/useTheme";
import { useI18n } from "../../hooks/useI18n";
import NewFontStyle from "../../components/features/NewFontStyle";
import { VariableControls } from "../../components/features/VariableControls";
import {
  useMessage,
  PopupMessageType,
  SaveMessageType,
} from "../../hooks/useMessage";
import { UserCSSStyle } from "../../services/storage/schema";

interface PopupState {
  isLoading: boolean;
  currentPage: "main" | "newFontStyle";
  currentTab: { id?: number; url?: string; title?: string } | null;
  availableStyles: UserCSSStyle[];
  activeStyles: UserCSSStyle[];
  expandedStyleId: string | null;
}

const App = () => {
  const [state, setState] = useState<PopupState>({
    isLoading: false,
    currentPage: "main",
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
              id: currentTab.id,
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



  const handleOpenFontSelector = () => {
    setState((prev) => ({ ...prev, currentPage: "newFontStyle" }));
  };

  const handleCloseFontSelector = () => {
    setState((prev) => ({ ...prev, currentPage: "main" }));
  };

  const handleSaveFontStyle = async () => {
    if (!selectedFont) return;

    setIsSavingFont(true);
    try {
      const result = await sendMessage(SaveMessageType.CREATE_FONT_STYLE, {
        domain: fontDomain || undefined,
        fontName: selectedFont,
      });

      if ("success" in result && result.success) {
        setState((prev) => ({ ...prev, currentPage: "main" }));
        // Close popup after successful creation
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        const errorMsg =
          "error" in result && result.error
            ? result.error
            : "Failed to create font style";
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Failed to save font style:", error);
    } finally {
      setIsSavingFont(false);
    }
  };

  // Extract current domain for auto-filling
  const getCurrentDomain = useCallback((): string => {
    if (!state.currentTab?.url) return "";
    try {
      if (
        state.currentTab.url === "current-site" ||
        state.currentTab.url === "restricted-url"
      ) {
        return "";
      }
      const url = new URL(state.currentTab.url);
      return url.hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }, [state.currentTab]);

  // Font style creation state
  const [fontDomain, setFontDomain] = useState("");
  const [selectedFont, setSelectedFont] = useState("");
  const [isSavingFont, setIsSavingFont] = useState(false);

  // Check if current page is restricted (browser/extension pages)
  const isRestrictedPage = Boolean(state.currentTab?.url &&
    (state.currentTab.url === "restricted-url" ||
     state.currentTab.url.startsWith("chrome://") ||
     state.currentTab.url.startsWith("about:") ||
     state.currentTab.url.startsWith("chrome-extension://")));

  // Update font domain when current tab changes or when switching to font page
  useEffect(() => {
    if (state.currentPage === "newFontStyle") {
      setFontDomain(getCurrentDomain());
    }
  }, [state.currentTab, state.currentPage, getCurrentDomain]);

  const handleToggleStyle = async (styleId: string, enabled: boolean) => {
    try {
      await sendMessage(PopupMessageType.TOGGLE_STYLE, {
        id: styleId,
        enabled,
        tabId: state.currentTab?.id,
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
      console.log("Variable changed in UI:", styleId, variableName, value);

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

  const renderContent = () => {
    if (isRestrictedPage) {
      return (
        <div className="text-center py-12">
          <div className="mb-4 flex justify-center">
            <img
              src="/icon/no-access.svg"
              alt="No access"
              className="w-24 h-24 opacity-70"
            />
          </div>
          <h3 className="text-xl font-semibold mb-4">No styles allowed on this page</h3>
          <div>
             <button
               onClick={() => browser.tabs.create({ url: 'https://userstyles.world/explore' })}
               className="btn btn-primary btn-sm"
             >
               Explore UserStyles.world
             </button>
          </div>
        </div>
      );
    } else if (state.currentPage === "newFontStyle") {
      return (
        <div className="space-y-4 px-2">
          <NewFontStyle
            domain={fontDomain}
            selectedFont={selectedFont}
            onDomainChange={setFontDomain}
            onFontChange={setSelectedFont}
            onClose={handleCloseFontSelector}
          />
        </div>
      );
    } else if (state.isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="loading loading-spinner loading-lg"></div>
          <p className="text-base-content/70">{t("loading")}</p>
        </div>
      );
    } else {
      return (
        <div className="space-y-4 px-2 py-2">
          {/* Show available styles for this site */}
          {state.availableStyles.length > 0 ? (
            <>
              <div className="space-y-2">
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
                        <input
                          type="checkbox"
                          className="toggle toggle-primary"
                          checked={style.enabled}
                          onChange={() =>
                            handleToggleStyle(style.id, !style.enabled)
                          }
                          title={
                            style.enabled ? "Disable style" : "Enable style"
                          }
                        />
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
              <div className="text-center mt-4">
                 <button
                   onClick={() => browser.tabs.create({ url: 'https://userstyles.world/explore' })}
                   className="btn btn-primary btn-sm"
                 >
                   Explore UserStyles.world
                 </button>
              </div>
            </>
          ) : (
             <div className="text-center py-8">
               <div className="mb-2 flex justify-center">
                 <img
                   src="/icon/add-style.svg"
                   alt="No styles available"
                   className="w-24 h-24 opacity-70"
                 />
               </div>
                <h3 className="text-xl font-semibold mb-0.5">No styles available yet</h3>
                <p className="text-base-content/70 text-md">
                  Create a custom style or find one online
                </p>
               <div className="mt-4">
                 <button
                   onClick={() => browser.tabs.create({ url: 'https://userstyles.world/explore' })}
                   className="btn btn-primary btn-sm"
                 >
                   Explore UserStyles.world
                 </button>
               </div>
             </div>
          )}
        </div>
      );
    }
  };

  return (
    <div className="bg-base-100 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-base-200 p-4 border-b border-base-300">
        <div className="flex items-center justify-between">
          {state.currentPage === "newFontStyle" ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-3 overflow-hidden" style={{maxWidth: 'calc(100% - 3rem)'}}>
                <button
                  onClick={handleCloseFontSelector}
                  className="btn btn-ghost btn-sm p-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                 <h3 className="text-lg font-bold text-base-content">
                   {t("font_createFontStyle")}
                 </h3>
              </div>
              <button
                onClick={handleSaveFontStyle}
                disabled={!selectedFont || isSavingFont}
                className="btn btn-primary btn-sm p-2"
              >
                {isSavingFont ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    {t("applying")}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-0.5" />
                    {t("applyButton")}
                  </>
                )}
              </button>
            </div>
           ) : (
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
               {!isRestrictedPage && (
                 <h3 className="text-lg font-bold text-base-content truncate" style={{maxWidth: '330px'}}>
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
               )}
             </div>
           )}
        </div>
      </div>

       {/* Main Content */}
       <div className={`flex-1 p-2 overflow-y-auto ${isDark ? "dark" : ""}`}>
         {renderContent()}
       </div>

      {/* Unified Footer */}
      {state.currentPage !== "newFontStyle" && (
        <div className="sticky bottom-0 bg-base-200 border-t border-base-300 p-2">
          <div className="flex justify-between items-center gap-2">
             <button
               disabled
               className="btn btn-primary btn-sm flex-1 justify-center normal-case text-xs whitespace-nowrap"
             >
               <Palette className="w-4 h-4 mr-0.5" />
               <span>{t("colors_apply")}</span>
             </button>

              <button
                onClick={handleOpenFontSelector}
                disabled={isRestrictedPage}
                className="btn btn-secondary btn-sm flex-1 justify-center normal-case text-xs whitespace-nowrap"
              >
                <TextSize className="w-4 h-4 mr-0.5" />
                <span>{t("font_apply")}</span>
              </button>

             <button
               onClick={handleOpenManager}
               className="btn btn-accent btn-sm flex-1 justify-center normal-case text-xs whitespace-nowrap"
             >
               <ViewGrid className="w-4 h-4 mr-0.5" />
               <span>{t("manageStyles")}</span>
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

const AppWithErrorBoundary = withErrorBoundary(App) as React.ComponentType;

export default AppWithErrorBoundary;
