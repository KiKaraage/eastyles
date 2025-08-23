/**
 * Manager Page Component for UserCSS Styles
 * Displays a table of all installed UserCSS styles with management capabilities
 */

import React, { useState, useEffect, useCallback } from "react";
import { storageClient } from "../../../services/storage/client";
import { UserCSSStyle } from "../../../services/storage/schema";
import { useMessage, PopupMessageType } from "../../../hooks/useMessage";
import { VariableControls } from "../VariableControls";
import { Trash, Edit, Settings, Upload, Download } from "iconoir-react";

const ManagerPage: React.FC = () => {
  const [styles, setStyles] = useState<UserCSSStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStyleId, setExpandedStyleId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

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

        // For now, we'll just update storage
        // Content script will be updated when the page is refreshed
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update variables",
        );
      }
    },
    [],
  );

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const userCssFile = files.find((file) => file.name.endsWith(".user.css"));

    if (userCssFile) {
      // Create object URL and redirect to apply page
      const fileUrl = URL.createObjectURL(userCssFile);
      window.location.href = `/apply.html?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(userCssFile.name)}`;
    }
  }, []);

  // Format domains for display
  const formatDomains = (domains: UserCSSStyle["domains"]) => {
    if (domains.length === 0) return "All sites";
    return domains
      .map((rule) => {
        switch (rule.kind) {
          case "url":
            return rule.pattern;
          case "url-prefix":
            return `${rule.pattern}*`;
          case "domain":
            return rule.pattern;
          case "regexp":
            return `/${rule.pattern}/`;
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
          <button className="btn btn-outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button className="btn btn-primary">
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
                      {/* Configure Button - only show if variables exist */}
                      {Object.keys(style.variables).length > 0 && (
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
                  Object.keys(style.variables).length > 0 && (
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
    </div>
  );
};

export default ManagerPage;
