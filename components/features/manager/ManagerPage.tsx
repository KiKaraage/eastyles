/**
 * Manager Page Component for UserCSS Styles
 * Displays a table of all installed UserCSS styles with management capabilities
 */

import React, { useState, useEffect, useCallback } from "react";
import { browser } from "@wxt-dev/browser";
import { storageClient } from "../../../services/storage/client";
import { UserCSSStyle } from "../../../services/storage/schema";
import { DomainRule } from "../../../services/usercss/types";
import {
  useMessage,
  PopupMessageType,
  SaveMessageType,
} from "../../../hooks/useMessage";
import { useI18n } from "../../../hooks/useI18n";
import { VariableControls } from "../VariableControls";
import {
  Trash,
  Edit,
  Settings,
  TransitionRight,
  TextSize,
  ArrowLeft,
  Check,
} from "iconoir-react";
import NewFontStyle from "../NewFontStyle";

const ManagerPage: React.FC = () => {
  const [styles, setStyles] = useState<UserCSSStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStyleId, setExpandedStyleId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragError, setDragError] = useState<string | null>(null);
  const [showFontModal, setShowFontModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStyle, setEditingStyle] = useState<UserCSSStyle | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [editingNamespace, setEditingNamespace] = useState<string>("");
  const [editingVersion, setEditingVersion] = useState<string>("");
  const [editingDescription, setEditingDescription] = useState<string>("");
  const [editingAuthor, setEditingAuthor] = useState<string>("");
  const [editingSourceUrl, setEditingSourceUrl] = useState<string>("");
  const [editingDomains, setEditingDomains] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const editDialogRef = React.useRef<HTMLDialogElement>(null);
  const fontDialogRef = React.useRef<HTMLDialogElement>(null);

  // Font style creation state
  const [fontDomain, setFontDomain] = useState("");
  const [selectedFont, setSelectedFont] = useState("");
  const [isSavingFont, setIsSavingFont] = useState(false);

  const { sendMessage } = useMessage();
  const { t } = useI18n();

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

  // Serialize domains to CSS-like format for editing
  const serializeDomains = useCallback((domains: DomainRule[]): string => {
    return domains
      .map((d) => {
        switch (d.kind) {
          case "domain":
            return `domain("${d.pattern}")`;
          case "url-prefix":
            return `url-prefix("${d.pattern}")`;
          case "url":
            return `url("${d.pattern}")`;
          case "regexp":
            return `regexp("${d.pattern}")`;
          default:
            return `${d.kind}("${d.pattern}")`;
        }
      })
      .join(", ");
  }, []);

  // Parse CSS-like string to domains
  const parseDomains = useCallback((text: string): DomainRule[] => {
    const domains: DomainRule[] = [];
    // Split by comma, but handle quotes
    const regex = /([^,()]+)\(("([^"]*)")\)/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const kind = match[1].trim();
      const pattern = match[3];
      if (["url", "url-prefix", "domain", "regexp"].includes(kind)) {
        domains.push({
          kind: kind as DomainRule["kind"],
          pattern,
          include: true,
        });
      }
    }
    if (domains.length === 0 && text.trim()) {
      throw new Error("No valid domain rules found");
    }
    return domains;
  }, []);

  // Handle editing style
  const handleEditStyle = useCallback(
    (style: UserCSSStyle) => {
      setEditingStyle(style);
      setEditingName(style.name);
      setEditingNamespace(style.namespace);
      setEditingVersion(style.version);
      setEditingDescription(style.description);
      setEditingAuthor(style.author);
      setEditingSourceUrl(style.sourceUrl);
      setEditingDomains(serializeDomains(style.domains));
      setHasUnsavedChanges(false);
      setShowEditModal(true);
    },
    [serializeDomains],
  );

  // Handle dialog open/close
  useEffect(() => {
    if (showEditModal && editDialogRef.current) {
      editDialogRef.current.showModal();
    } else if (!showEditModal && editDialogRef.current) {
      editDialogRef.current.close();
    }
  }, [showEditModal]);

  useEffect(() => {
    if (showFontModal && fontDialogRef.current) {
      fontDialogRef.current.showModal();
    } else if (!showFontModal && fontDialogRef.current) {
      fontDialogRef.current.close();
    }
  }, [showFontModal]);

  // Detect unsaved changes
  useEffect(() => {
    if (editingStyle) {
      const changed =
        editingName !== editingStyle.name ||
        editingNamespace !== editingStyle.namespace ||
        editingVersion !== editingStyle.version ||
        editingDescription !== editingStyle.description ||
        editingAuthor !== editingStyle.author ||
        editingSourceUrl !== editingStyle.sourceUrl ||
        editingDomains !== serializeDomains(editingStyle.domains);
      setHasUnsavedChanges(changed);
    }
  }, [
    editingStyle,
    editingName,
    editingNamespace,
    editingVersion,
    editingDescription,
    editingAuthor,
    editingSourceUrl,
    editingDomains,
    serializeDomains,
  ]);

  const handleSaveEdit = useCallback(async () => {
    if (editingStyle && editingName.trim()) {
      try {
        const updatedDomains = parseDomains(editingDomains);
        await storageClient.updateUserCSSStyle(editingStyle.id, {
          name: editingName.trim(),
          namespace: editingNamespace.trim() || editingStyle.namespace,
          version: editingVersion.trim() || editingStyle.version,
          description: editingDescription.trim() || editingStyle.description,
          author: editingAuthor.trim() || editingStyle.author,
          sourceUrl: editingSourceUrl.trim() || editingStyle.sourceUrl,
          domains: updatedDomains,
        });
        setShowEditModal(false);
        setEditingStyle(null);
        setEditingName("");
        setEditingNamespace("");
        setEditingVersion("");
        setEditingDescription("");
        setEditingAuthor("");
        setEditingSourceUrl("");
        setEditingDomains("");
        setHasUnsavedChanges(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update style");
      }
    }
  }, [
    editingStyle,
    editingName,
    editingNamespace,
    editingVersion,
    editingDescription,
    editingAuthor,
    editingSourceUrl,
    editingDomains,
    parseDomains,
  ]);

  const handleCancelEdit = useCallback(
    (force = false) => {
      if (!force && hasUnsavedChanges) {
        if (
          !confirm(
            "You have unsaved changes. Are you sure you want to discard them?",
          )
        ) {
          return;
        }
      }
      setShowEditModal(false);
      setEditingStyle(null);
      setEditingName("");
      setEditingNamespace("");
      setEditingVersion("");
      setEditingDescription("");
      setEditingAuthor("");
      setEditingSourceUrl("");
      setEditingDomains("");
      setHasUnsavedChanges(false);
    },
    [hasUnsavedChanges],
  );

  const handleDialogCancel = useCallback(
    (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
      if (hasUnsavedChanges) {
        if (
          !confirm(
            "You have unsaved changes. Are you sure you want to discard them?",
          )
        ) {
          e.preventDefault();
          return;
        }
      }
      setShowEditModal(false);
    },
    [hasUnsavedChanges],
  );

  // Handle Esc key to close modal
  useEffect(() => {
    if (!showEditModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancelEdit(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showEditModal, handleCancelEdit]);

  // Handle file import via button click
  const handleImportClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".css,.user.css";
    input.multiple = false;

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (
        file &&
        (file.name.endsWith(".user.css") || file.name.endsWith(".css"))
      ) {
        try {
          // Read the file content directly
          const cssContent = await file.text();
          console.log("Read imported CSS file, length:", cssContent.length);

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
          console.error("Failed to read imported CSS file:", error);
          setError("Failed to read the CSS file");
        }
      } else if (file) {
        setError("Please select a .css or .user.css file");
      }
    };

    input.click();
  }, []);

  // Handle drag and drop for the entire document to show modal when files are dragged over the page
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dragCounter = 0; // Track multiple dragenter/dragleave events

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy"; // Show copy cursor
      if (e.dataTransfer?.types.includes("Files")) {
        dragCounter++;
        if (dragCounter === 1) {
          setIsDragOver(true);
          setDragError(null); // Clear any previous drag errors
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "copy"; // Show copy cursor
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) {
        dragCounter--;
        if (dragCounter === 0) {
          setIsDragOver(false);
          setDragError(null); // Clear drag error when leaving
        }
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0; // Reset counter

      if (e.dataTransfer) {
        const files = Array.from(e.dataTransfer.files);
        const cssFile = files.find(
          (file) =>
            file.name.endsWith(".css") || file.name.endsWith(".user.css"),
        );

        if (cssFile) {
          setDragError(null); // Clear any error for valid file
          cssFile
            .text()
            .then((cssContent) => {
              const storageId = `usercss_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              sessionStorage.setItem(storageId, cssContent);
              const saveUrl = browser.runtime.getURL("/save.html");
              const filename = encodeURIComponent(cssFile.name);
              const finalUrl = `${saveUrl}?storageId=${storageId}&filename=${filename}&source=local`;
              window.location.href = finalUrl;
            })
            .catch((error) => {
              console.error("Failed to read CSS file:", error);
              setDragError("Failed to read the CSS file");
              // Keep the modal open for 3 seconds to show the error
              setTimeout(() => {
                setIsDragOver(false);
                setDragError(null);
              }, 3000);
            });
        } else {
          setDragError(
            "Only CSS files (.css or .user.css) are supported. Please drag a valid CSS file.",
          );
          // Keep the modal open for 3 seconds to show the error
          setTimeout(() => {
            setIsDragOver(false);
            setDragError(null);
          }, 3000);
        }
      } else {
        setIsDragOver(false);
      }
    };

    // Add event listeners to the document to catch all drag operations
    document.addEventListener("dragenter", handleDragEnter);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragenter", handleDragEnter);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
    };
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
    <div ref={containerRef} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <p className="text-base-content/70">
            Manage your installed UserCSS styles
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={handleImportClick}>
            <TransitionRight className="w-4 h-4 mr-2" />
            {t("manager_addUserCss")}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowFontModal(true)}
          >
            <TextSize className="w-4 h-4 mr-2" />
            {t("font_createFontStyle")}
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

      {/* Drag and Drop Modal */}
      {isDragOver && (
        <dialog className="modal modal-open">
          <div className="modal-box w-6xl flex flex-col items-center justify-center text-center scale-95 animate-in fade-in-90 zoom-in-90 duration-200">
            <TransitionRight className="w-16 h-16 mx-auto mb-6 text-base-content/70" />
            <h3 className="text-2xl font-bold mb-2">
              Drop CSS files here to import
            </h3>
            <p className="text-base text-base-content/80 mb-4">
              Supports .css and .user.css files
            </p>

            {dragError && (
              <div className="alert alert-warning w-full mt-4">
                <span className="text-center block w-full">{dragError}</span>
              </div>
            )}
          </div>
        </dialog>
      )}

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {styles.map((style) => (
            <div
              key={style.id}
              className="card bg-base-200 shadow-md flex flex-col h-full"
            >
              <div className="card-body p-4 flex flex-col flex-grow">
                {/* Main Style Row */}
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 flex-grow">
                  {/* Toggle Switch */}
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={style.enabled}
                    onChange={() => toggleStyle(style.id, !style.enabled)}
                    title={style.enabled ? "Disable style" : "Enable style"}
                  />

                  {/* Style Info */}
                  <div className="min-w-0 flex flex-col justify-center">
                    <div
                      className="flex items-center gap-2"
                      title={`${style.name} by ${style.author}`}
                    >
                      <h3 className="font-semibold truncate">{style.name}</h3>
                      <span className="text-base-content truncate">
                        by {style.author}
                      </span>
                    </div>
                    <p
                      className="text-sm text-base-content/70 truncate"
                      title={style.description}
                    >
                      {style.description}
                    </p>
                    <p
                      className="text-xs text-base-content/50 truncate"
                      title={formatDomains(style.domains)}
                    >
                      Domains: {formatDomains(style.domains)}
                    </p>
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

                    {/* Edit Style Button */}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleEditStyle(style)}
                      title="Edit style"
                    >
                      <Edit className="w-4 h-4" />
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

      {/* Create Font Style Modal */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={fontDialogRef}
        className="modal"
        onClose={() => setShowFontModal(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowFontModal(false);
          }
        }}
      >
        <div className="modal-box max-w-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFontModal(false)}
                className="btn btn-ghost btn-sm p-2"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold">{t("font_createFontStyle")}</h3>
            </div>
            <button
              onClick={async () => {
                if (!selectedFont) return;

                setIsSavingFont(true);
                try {
                  const result = await sendMessage(
                    SaveMessageType.CREATE_FONT_STYLE,
                    {
                      domain: fontDomain || undefined,
                      fontName: selectedFont,
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
                    throw new Error(errorMsg);
                  }
                } catch (error) {
                  console.error("Failed to save font style:", error);
                } finally {
                  setIsSavingFont(false);
                }
              }}
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

          <NewFontStyle
            domain={fontDomain}
            selectedFont={selectedFont}
            onDomainChange={setFontDomain}
            onFontChange={setSelectedFont}
            onClose={() => setShowFontModal(false)}
          />
        </div>
      </dialog>

      {/* Edit Style Modal */}
      <dialog
        ref={editDialogRef}
        className="modal"
        onCancel={handleDialogCancel}
        onClose={() => setShowEditModal(false)}
      >
        <div className="modal-box max-w-lg flex flex-col max-h-[90vh]">
          <div className="flex justify-left mb-4">
            <h3 className="text-lg font-bold">Edit Metadata</h3>
          </div>

          <form
            className="flex flex-col flex-1 overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveEdit();
              editDialogRef.current?.close();
            }}
          >
            <div className="flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="label" htmlFor="style-name">
                  <span className="label-text">Style Name</span>
                </label>
                <input
                  id="style-name"
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="Enter style name"
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="style-namespace">
                  <span className="label-text">Namespace</span>
                </label>
                <input
                  id="style-namespace"
                  type="text"
                  value={editingNamespace}
                  onChange={(e) => setEditingNamespace(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="Enter namespace"
                />
              </div>

              <div>
                <label className="label" htmlFor="style-version">
                  <span className="label-text">Version</span>
                </label>
                <input
                  id="style-version"
                  type="text"
                  value={editingVersion}
                  onChange={(e) => setEditingVersion(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="Enter version"
                />
              </div>

              <div>
                <label className="label" htmlFor="style-description">
                  <span className="label-text">Description</span>
                </label>
                <textarea
                  id="style-description"
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  className="textarea textarea-bordered w-full h-24"
                  placeholder="Enter description"
                />
              </div>

              <div>
                <label className="label" htmlFor="style-author">
                  <span className="label-text">Author</span>
                </label>
                <input
                  id="style-author"
                  type="text"
                  value={editingAuthor}
                  onChange={(e) => setEditingAuthor(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="Enter author"
                />
              </div>

              <div>
                <label className="label" htmlFor="style-source-url">
                  <span className="label-text">Source URL</span>
                </label>
                <input
                  id="style-source-url"
                  type="text"
                  value={editingSourceUrl}
                  onChange={(e) => setEditingSourceUrl(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="Enter source URL"
                />
              </div>

              <div>
                <label className="label" htmlFor="style-domains">
                  <span className="label-text">
                    Domains (CSS format: domain("example.com"),
                    url-prefix("https://example.org"))
                  </span>
                </label>
                <input
                  id="style-domains"
                  type="text"
                  value={editingDomains}
                  onChange={(e) => setEditingDomains(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder='domain("example.com"), url-prefix("https://example.org")'
                />
                <div className="text-xs text-base-content/70 mt-1">
                  Separate multiple rules with commas
                </div>
              </div>
            </div>

            <div className="modal-action">
              <form method="dialog">
                <button
                  type="submit"
                  className="btn btn-ghost"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
              </form>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!editingName.trim()}
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
};

export default ManagerPage;
