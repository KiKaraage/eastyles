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
  Edit,
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
import type { UserCSSStyle } from "../../services/storage/schema";

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

  // Load styles for current tab
  const loadStyles = useCallback(
    async (currentTabUrl?: string) => {
      try {
        let availableStyles: UserCSSStyle[] = [];
        const tabUrl = currentTabUrl || state.currentTab?.url || "current-site";

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
          const response = await sendMessage(PopupMessageType.GET_STYLES, {});
          console.log("[Popup] GET_STYLES response:", response);
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
    },
    [state.currentTab?.url, sendMessage],
  );

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

          // Load styles for the current tab
          await loadStyles(tabUrl);
        }
      } catch (error) {
        console.error("[Popup] Failed to load popup data:", error);
      } finally {
        console.log("[Popup] Finished loading, setting loading to false");
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    loadPopupData();
  }, [loadStyles]);

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
    setEditingFontStyleId(null);
    setFontDomain("");
    setSelectedFont("");
    setOriginalFontDomain("");
    setOriginalSelectedFont("");
  };

  const handleSaveFontStyle = async () => {
    if (!selectedFont) return;

    setIsSavingFont(true);
    try {
      const messageType = editingFontStyleId
        ? SaveMessageType.UPDATE_FONT_STYLE
        : SaveMessageType.CREATE_FONT_STYLE;
      const payload = editingFontStyleId
        ? {
            styleId: editingFontStyleId,
            domain: fontDomain || undefined,
            fontName: selectedFont,
          }
        : {
            domain: fontDomain || undefined,
            fontName: selectedFont,
          };

      const result = await sendMessage(messageType, payload);

      if ("success" in result && result.success) {
        // Reload styles to reflect the changes
        await loadStyles();
        setState((prev) => ({ ...prev, currentPage: "main" }));
      } else {
        const errorMsg =
          "error" in result && result.error
            ? result.error
            : `Failed to ${editingFontStyleId ? "update" : "create"} font style`;
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error(
        `Failed to ${editingFontStyleId ? "update" : "save"} font style:`,
        error,
      );
    } finally {
      setIsSavingFont(false);
      setEditingFontStyleId(null);
      setOriginalFontDomain("");
      setOriginalSelectedFont("");
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
  const [editingFontStyleId, setEditingFontStyleId] = useState<string | null>(
    null,
  );
  const [originalFontDomain, setOriginalFontDomain] = useState("");
  const [originalSelectedFont, setOriginalSelectedFont] = useState("");

  // Check if there are unsaved changes in font editing
  const hasFontChanges =
    Boolean(editingFontStyleId) &&
    (fontDomain !== originalFontDomain ||
      selectedFont !== originalSelectedFont);

  // Check if current page is restricted (browser/extension pages)
  const isRestrictedPage = Boolean(
    state.currentTab?.url &&
      (state.currentTab.url === "restricted-url" ||
        state.currentTab.url.startsWith("chrome://") ||
        state.currentTab.url.startsWith("about:") ||
        state.currentTab.url.startsWith("chrome-extension://")),
  );

  // Update font domain when current tab changes or when switching to font page
  useEffect(() => {
    if (state.currentPage === "newFontStyle") {
      setFontDomain(getCurrentDomain());
    }
  }, [state.currentPage, getCurrentDomain]);

  // Helper function to format style names with badges for font styles
  const formatStyleName = (name: string) => {
    if (name.startsWith("[FONT] ")) {
      const fontName = name.substring(7).trim(); // Remove "[FONT] " prefix and trim
      return (
        <div className="flex items-center gap-1">
          <div className="badge badge-secondary badge-xs">FONT</div>
          <span>{fontName}</span>
        </div>
      );
    }
    return name;
  };

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
          ? (() => {
              const styleToAdd = prev.availableStyles.find(
                (s) => s.id === styleId,
              );
              return styleToAdd
                ? [...prev.activeStyles, styleToAdd]
                : prev.activeStyles;
            })()
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
          <h3 className="text-xl font-semibold mb-4">
            No styles allowed on this page
          </h3>
          <div>
            <button
              type="button"
              onClick={() =>
                browser.tabs.create({ url: "https://userstyles.world/explore" })
              }
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
                          {formatStyleName(style.name)}
                        </h5>
                        <p className="text-xs text-base-content/70 truncate">
                          {style.description}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Edit button for font styles */}
                        {style.name.startsWith("[FONT] ") && (
                          <button
                            type="button"
                            onClick={() => {
                              const fontName = style.name.substring(7).trim();
                              setSelectedFont(fontName);
                              setOriginalSelectedFont(fontName);
                              // Extract domain from the first domain rule if it exists
                              const domainFromStyle =
                                style.domains.length > 0 &&
                                style.domains[0].kind === "domain"
                                  ? style.domains[0].pattern
                                  : "";
                              setFontDomain(domainFromStyle);
                              setOriginalFontDomain(domainFromStyle);
                              setEditingFontStyleId(style.id);
                              setState((prev) => ({
                                ...prev,
                                currentPage: "newFontStyle",
                              }));
                            }}
                            className="btn btn-ghost btn-sm"
                            title="Edit font style"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {/* Settings button for styles with variables */}
                        {Object.keys(style.variables).length > 0 && (
                          <button
                            type="button"
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
                      Object.keys(style.variables).length > 0 && (
                        <div className="px-2 py-2">
                          <VariableControls
                            showTitle={false}
                            variables={Object.values(style.variables).map(
                              (v) => {
                                const boolLike =
                                  v.type !== "checkbox" &&
                                  ((v.options &&
                                    v.options.length === 2 &&
                                    v.options.every((o) =>
                                      ["0", "1", "true", "false"].includes(
                                        (typeof o === "string" ? o : o.value)
                                          .toString()
                                          .toLowerCase(),
                                      ),
                                    )) ||
                                    ["0", "1", "true", "false"].includes(
                                      (v.value || v.default || "")
                                        .toString()
                                        .toLowerCase(),
                                    ));
                                return boolLike
                                  ? { ...v, type: "checkbox" as const }
                                  : v;
                              },
                            )}
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
                  type="button"
                  onClick={() =>
                    browser.tabs.create({
                      url: "https://userstyles.world/explore",
                    })
                  }
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
              <h3 className="text-xl font-semibold mb-0.5">
                No styles available yet
              </h3>
              <p className="text-base-content/70 text-md">
                Create a custom style or find one online
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() =>
                    browser.tabs.create({
                      url: "https://userstyles.world/explore",
                    })
                  }
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
      <div className="bg-base-200 p-4 border-b border-base-300 fixed top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-between">
          {state.currentPage === "newFontStyle" ? (
            <div className="flex items-center justify-between w-full">
              <div
                className="flex items-center space-x-3 overflow-hidden"
                style={{ maxWidth: "calc(100% - 3rem)" }}
              >
                <button
                  type="button"
                  onClick={handleCloseFontSelector}
                  className="btn btn-ghost btn-sm p-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-lg font-bold text-base-content">
                  {editingFontStyleId
                    ? t("font_editStyle")
                    : t("font_createFontStyle")}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleSaveFontStyle}
                disabled={
                  !selectedFont ||
                  isSavingFont ||
                  (editingFontStyleId ? !hasFontChanges : false)
                }
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
                <h3
                  className="text-lg font-bold text-base-content truncate"
                  style={{ maxWidth: "330px" }}
                >
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
                            state.currentTab.url.startsWith(
                              "chrome-extension://",
                            )
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
      <div
        className={`flex-1 p-2 pt-18 overflow-y-auto ${isDark ? "dark" : ""}`}
      >
        {renderContent()}
      </div>

      {/* Unified Footer */}
      {state.currentPage !== "newFontStyle" && (
        <div className="sticky bottom-0 bg-base-200 border-t border-base-300 p-2">
          <div className="flex justify-between items-center gap-2">
            <button
              type="button"
              disabled
              className="btn btn-primary btn-sm flex-1 justify-center normal-case text-xs whitespace-nowrap"
            >
              <Palette className="w-4 h-4 mr-0.5" />
              <span>{t("colors_apply")}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenFontSelector}
              disabled={isRestrictedPage}
              className="btn btn-secondary btn-sm flex-1 justify-center normal-case text-xs whitespace-nowrap"
            >
              <TextSize className="w-4 h-4 mr-0.5" />
              <span>{t("font_apply")}</span>
            </button>

            <button
              type="button"
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
