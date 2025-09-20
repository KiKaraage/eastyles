/**
 * Manager Page Component for UserCSS Styles
 * Displays a table of all installed UserCSS styles with management capabilities
 */

import React, { useState, useEffect, useCallback } from "react";
import { browser } from "@wxt-dev/browser";
import { storageClient } from "../../../services/storage/client";
import { UserCSSStyle } from "../../../services/storage/schema";
import {
  useMessage,
  PopupMessageType,
  SaveMessageType,
} from "../../../hooks/useMessage";
import { VariableControls } from "../VariableControls";
import {
  fontRegistry,
  BuiltInFont,
} from "../../../services/usercss/font-registry";
import { Trash, Edit, Settings, Upload, Download } from "iconoir-react";

const ManagerPage: React.FC = () => {
  const [styles, setStyles] = useState<UserCSSStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStyleId, setExpandedStyleId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFontModal, setShowFontModal] = useState(false);

  const { sendMessage } = useMessage();

  // Load UserCSS styles
  const loadStyles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const userCSSStyles = await storageClient.getUserCSSStyles();
      setStyles(userCSSStyles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load styles");
    } finally {
      setLoading(false);
    }
  }, []);

  // Watch for style changes
  useEffect(() => {
    loadStyles();

    const unsubscribe = storageClient.watchUserCSSStyles((newStyles) => {
      setStyles(newStyles);
    });

    return unsubscribe;
  }, [loadStyles]);

  // Toggle style enabled state
  const toggleStyle = useCallback(
    async (styleId: string, enabled: boolean) => {
      try {
        await storageClient.enableUserCSSStyle(styleId, enabled);

        // Notify content script to update injection
        await sendMessage(PopupMessageType.TOGGLE_STYLE, {
          id: styleId,
          enabled,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to toggle style");
      }
    },
    [sendMessage],
  );

  // Delete style with confirmation
  const deleteStyle = useCallback(
    async (styleId: string, styleName: string) => {
      const confirmed = window.confirm(
        `Are you sure you want to delete "${styleName}"? This action cannot be undone.`,
      );

      if (!confirmed) return;

      try {
        await storageClient.removeUserCSSStyle(styleId);

        // For now, we'll just remove from storage
        // Content script will be updated when the page is refreshed
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete style");
      }
    },
    [],
  );

  // Update style variables
  const updateVariables = useCallback(
    async (styleId: string, variables: Record<string, string>) => {
      try {
        await storageClient.updateUserCSSStyleVariables(styleId, variables);

        // Notify content script to update variables immediately
        await sendMessage(PopupMessageType.UPDATE_VARIABLES, {
          styleId,
          variables,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update variables",
        );
      }
    },
    [sendMessage],
  );

  // Handle file import via button click
  const handleImportClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".user.css";
    input.multiple = false;

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && file.name.endsWith(".user.css")) {
        try {
          // Read the file content directly
          const cssContent = await file.text();
          console.log("Read imported UserCSS file, length:", cssContent.length);

          // Store content in sessionStorage to avoid URL length limits
          const storageId = `usercss_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          sessionStorage.setItem(storageId, cssContent);

          // Pass storage ID instead of content
          const saveUrl = browser.runtime.getURL("/save.html");
          const filename = encodeURIComponent(file.name);
          const finalUrl = `${saveUrl}?storageId=${storageId}&filename=${filename}&source=local`;

          console.log("Redirecting to Save page with storage reference");
          window.location.href = finalUrl;
        } catch (error) {
          console.error("Failed to read imported UserCSS file:", error);
          setError("Failed to read the UserCSS file");
        }
      } else if (file) {
        setError("Please select a .user.css file");
      }
    };

    input.click();
  }, []);

  // Handle export functionality
  const handleExportClick = useCallback(async () => {
    try {
      setError(null);
      // Get all UserCSS styles for export
      const userCSSStyles = await storageClient.getUserCSSStyles();

      if (userCSSStyles.length === 0) {
        setError("No styles to export");
        return;
      }

      // Create export data structure
      const exportData = {
        styles: userCSSStyles,
        timestamp: Date.now(),
        version: "1.0.0",
      };

      // Convert to JSON and create download
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eastyles_styles_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show success message
      setError(null);
      // You could add a success toast here similar to the Save page
    } catch (error) {
      console.error("Failed to export styles:", error);
      setError("Failed to export styles");
    }
  }, []);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const userCssFile = files.find((file) => file.name.endsWith(".user.css"));

    if (userCssFile) {
      try {
        // Read the file content directly
        const cssContent = await userCssFile.text();
        console.log("Read local UserCSS file, length:", cssContent.length);

        // Store content in sessionStorage to avoid URL length limits
        const storageId = `usercss_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem(storageId, cssContent);

        // Pass storage ID instead of content
        const saveUrl = browser.runtime.getURL("/save.html");
        const filename = encodeURIComponent(userCssFile.name);
        const finalUrl = `${saveUrl}?storageId=${storageId}&filename=${filename}&source=local`;

        console.log("Redirecting to Save page with storage reference");
        window.location.href = finalUrl;
      } catch (error) {
        console.error("Failed to read local UserCSS file:", error);
        setError("Failed to read the UserCSS file");
      }
    }
  }, []);

  // Format domains for display
  const formatDomains = (domains: UserCSSStyle["domains"]) => {
    if (domains.length === 0) return "All sites";
    return domains
      .map((rule) => {
        switch (rule.kind) {
          case "url":
            return `exact: ${rule.pattern}`;
          case "url-prefix":
            try {
              const url = new URL(rule.pattern);
              const domain = url.hostname;
              return `start with ${domain}`;
            } catch {
              return `start with ${rule.pattern}`;
            }
          case "domain":
            return rule.pattern;
          case "regexp":
            return `pattern: /${rule.pattern}/`;
          default:
            return rule.pattern;
        }
      })
      .join(", ");
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Manage Styles</h2>
          <p className="text-base-content/70">
            Manage your installed UserCSS styles
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleExportClick}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowFontModal(true)}
          >
            <span className="text-lg mr-2">Aa</span>
            New Font Style
          </button>
          <button className="btn btn-primary" onClick={handleImportClick}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Drag and Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? "border-primary bg-primary/10"
            : "border-base-300 hover:border-primary/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-base-content/50" />
        <p className="text-lg font-medium mb-2">
          Drop UserCSS files here to import
        </p>
        <p className="text-sm text-base-content/70">
          or click the Import button above
        </p>
      </div>

      {/* Styles Table */}
      {styles.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-semibold mb-2">No styles installed</h3>
          <p className="text-base-content/70 mb-4">
            Get started by importing a UserCSS file or clicking on a .user.css
            link
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {styles.map((style) => (
            <div
              key={style.id}
              className={`card bg-base-100 shadow-sm border transition-opacity ${
                !style.enabled ? "opacity-50" : ""
              }`}
            >
              <div className="card-body p-4">
                {/* Main Style Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    {/* Toggle Button */}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleStyle(style.id, !style.enabled)}
                      title={style.enabled ? "Disable style" : "Enable style"}
                    >
                      <div
                        className={`w-5 h-5 rounded-full ${style.enabled ? "bg-success" : "bg-base-content/20"}`}
                      />
                    </button>

                    {/* Style Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{style.name}</h3>
                      <p className="text-sm text-base-content/70 truncate">
                        {style.description}
                      </p>
                      <p className="text-xs text-base-content/50 truncate">
                        Domains: {formatDomains(style.domains)}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center space-x-2">
                    <div
                      className={`badge ${
                        style.enabled ? "badge-success" : "badge-ghost"
                      }`}
                    >
                      {style.enabled ? "Active" : "Disabled"}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex space-x-1">
                      {/* Configure Button - only show if variables exist and style is enabled */}
                      {Object.keys(style.variables).length > 0 &&
                        style.enabled && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setExpandedStyleId(
                                expandedStyleId === style.id ? null : style.id,
                              )
                            }
                            title="Configure variables"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        )}

                      {/* Edit Button - disabled for now */}
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled
                        title="Edit (coming soon)"
                      >
                        <Edit className="w-4 h-4 opacity-50" />
                      </button>

                      {/* Delete Button */}
                      <button
                        className="btn btn-ghost btn-sm text-error hover:bg-error hover:text-error-content"
                        onClick={() => deleteStyle(style.id, style.name)}
                        title="Delete style"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Variable Controls */}
                {expandedStyleId === style.id &&
                  Object.keys(style.variables).length > 0 &&
                  style.enabled && (
                    <div className="mt-4 pt-4 border-t border-base-300">
                      <h4 className="font-medium mb-3">Configure Variables</h4>
                      <VariableControls
                        variables={Object.values(style.variables)}
                        onChange={(variableName, value) => {
                          updateVariables(style.id, { [variableName]: value });
                        }}
                      />
                    </div>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Font Style Modal */}
      {showFontModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-base-100 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Create Font Style</h3>
                <button
                  onClick={() => setShowFontModal(false)}
                  className="btn btn-sm btn-ghost"
                >
                  ✕
                </button>
              </div>

              <FontStyleModal
                onSave={async (domain, fontName) => {
                  try {
                    // Use the new CREATE_FONT_STYLE message
                    const result = await sendMessage(
                      SaveMessageType.CREATE_FONT_STYLE,
                      {
                        domain: domain || undefined,
                        fontName,
                      },
                    );

                    if ("success" in result && result.success) {
                      setShowFontModal(false);
                      loadStyles(); // Refresh the styles list
                    } else {
                      const errorMsg =
                        "error" in result && result.error
                          ? result.error
                          : "Failed to create font style";
                      setError(errorMsg);
                    }
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Failed to create font style",
                    );
                  }
                }}
                onClose={() => setShowFontModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Font Style Modal Component
interface FontStyleModalProps {
  onSave: (domain: string, fontName: string) => Promise<void>;
  onClose: () => void;
}

const FontStyleModal: React.FC<FontStyleModalProps> = ({ onSave, onClose }) => {
  const [domain, setDomain] = useState("");
  const [selectedFont, setSelectedFont] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const builtInFonts = fontRegistry.getBuiltInFonts();

  const handleSave = async () => {
    if (!selectedFont) {
      setModalError("Please select a font");
      return;
    }

    setIsSaving(true);
    setModalError(null);
    try {
      await onSave(domain.trim(), selectedFont);
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Failed to save font style",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {modalError && (
        <div className="alert alert-error">
          <span>{modalError}</span>
        </div>
      )}

      <div className="form-control">
        <label className="label" htmlFor="domain-input">
          <span className="label-text">Domain (optional)</span>
        </label>
        <input
          id="domain-input"
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="e.g., example.com (leave empty for all sites)"
          className="input input-bordered w-full"
        />
        <label className="label" htmlFor="domain-input">
          <span className="label-text text-xs text-base-content/60">
            Leave empty to apply to all sites
          </span>
        </label>
      </div>

      <div className="form-control">
        <label className="label" htmlFor="font-select">
          <span className="label-text">Font</span>
        </label>
        <select
          id="font-select"
          value={selectedFont}
          onChange={(e) => setSelectedFont(e.target.value)}
          className="select select-bordered w-full"
        >
          <option value="">Select a font...</option>
          {builtInFonts.map((font: BuiltInFont) => (
            <option key={font.name} value={font.name}>
              {font.name} ({font.category})
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-ghost" disabled={isSaving}>
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!selectedFont || isSaving}
          className="btn btn-primary"
        >
          {isSaving ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Saving...
            </>
          ) : (
            "Save Font Style"
          )}
        </button>
      </div>
    </div>
  );
};

export default ManagerPage;
