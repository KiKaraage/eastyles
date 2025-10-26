/**
 * Manager Page Component for UserCSS Styles
 * Displays a table of all installed UserCSS styles with management capabilities
 */

import {
  ArrowLeft,
  Check,
  Edit,
  Settings,
  TextSize,
  TransitionRight,
  Trash,
} from "iconoir-react";
import React, { useCallback, useEffect, useId, useState } from "react";
import { browser } from "wxt/browser";
import { useI18n } from "../../../hooks/useI18n";
import {
  PopupMessageType,
  SaveMessageType,
  useMessage,
} from "../../../hooks/useMessage";
import { storageClient } from "../../../services/storage/client";
import type { UserCSSStyle } from "../../../services/storage/schema";
import type { DomainRule } from "../../../services/usercss/types";
import NewFontStyle from "../NewFontStyle";
import { VariableControls } from "../VariableControls";

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

  // Serialize domains to CSS-like format for editing
  const serializeDomains = useCallback((domains: DomainRule[]): string => {
    // Extract hostnames from url-prefix rules
    const urlPrefixHosts = new Set<string>();
    domains.forEach((d) => {
      if (d.kind === "url-prefix") {
        try {
          const url = new URL(d.pattern);
          urlPrefixHosts.add(url.hostname);
        } catch {
          // Ignore invalid URLs
        }
      }
    });

    // Filter out domain rules that are covered by url-prefix rules
    const filteredDomains = domains.filter((d) => {
      if (d.kind === "domain") {
        return !urlPrefixHosts.has(d.pattern);
      }
      return true;
    });

    return filteredDomains
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

  // ✅ Calculate hasUnsavedChanges during rendering instead of using useEffect
  const hasUnsavedChanges = editingStyle
    ? editingName !== editingStyle.name ||
      editingNamespace !== editingStyle.namespace ||
      editingVersion !== editingStyle.version ||
      editingDescription !== editingStyle.description ||
      editingAuthor !== editingStyle.author ||
      editingSourceUrl !== editingStyle.sourceUrl ||
      editingDomains !== serializeDomains(editingStyle.domains)
    : false;
  const editDialogRef = React.useRef<HTMLDialogElement>(null);
  const fontDialogRef = React.useRef<HTMLDialogElement>(null);
  const namespaceId = useId();
  const descriptionId = useId();
  const authorId = useId();
  const sourceUrlId = useId();

  // Font style creation state
  const [fontDomain, setFontDomain] = useState("");
  const [selectedFont, setSelectedFont] = useState("");
  const [isSavingFont, setIsSavingFont] = useState(false);
  const [editingFontStyle, setEditingFontStyle] = useState<UserCSSStyle | null>(
    null,
  );
  const [originalFontDomain, setOriginalFontDomain] = useState("");
  const [originalSelectedFont, setOriginalSelectedFont] = useState("");

  // Check if there are unsaved changes in font editing
  const hasFontChanges =
    Boolean(editingFontStyle) &&
    (fontDomain !== originalFontDomain ||
      selectedFont !== originalSelectedFont);

  const styleNameId = React.useId();
  const styleVersionId = React.useId();
  const styleDomainsId = React.useId();
  const { sendMessage } = useMessage();
  const { t } = useI18n();

  // Load UserCSS styles - memoized with explicit dependencies
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
  }, []); // No dependencies needed - storageClient is stable

  // Watch for style changes - optimized to avoid unnecessary re-runs
  useEffect(() => {
    loadStyles();

    const unsubscribe = storageClient.watchUserCSSStyles((newStyles) => {
      setStyles(newStyles);
    });

    return unsubscribe;
  }, [loadStyles]); // Remove loadStyles dependency since it's stable and causes re-runs

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

  // Handle individual variable changes
  const handleVariableChange = useCallback(
    async (styleId: string, variableName: string, value: string) => {
      await updateVariables(styleId, { [variableName]: value });
    },
    [updateVariables],
  );

  // Parse CSS-like string to domains
  const parseDomains = useCallback((text: string): DomainRule[] => {
    // Strip @-moz-document prefix if present
    const cleanText = text.replace(/^@-moz-document\s+/, "").trim();
    const domains: DomainRule[] = [];
    // Split by comma, but handle quotes
    const regex = /([^,()]+)\(("([^"]*)")\)/g;
    let match: RegExpExecArray | null;
    while (true) {
      match = regex.exec(cleanText);
      if (match === null) break;
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
      const domainText =
        style.originalDomainCondition || serializeDomains(style.domains);
      setEditingDomains(
        domainText.startsWith("@-moz-document")
          ? domainText
          : `@-moz-document ${domainText}`,
      );
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
          originalDomainCondition: editingDomains
            .replace(/^@-moz-document\s+/, "")
            .trim(),
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
          console.log(
            "[ea-ManagerPage] Read imported CSS file, length:",
            cssContent.length,
          );

          // Store content in sessionStorage to avoid URL length limits
          const storageId = `usercss_import_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          sessionStorage.setItem(storageId, cssContent);

          // Pass storage ID instead of content
          const saveUrl = browser.runtime.getURL("/save.html");
          const filename = encodeURIComponent(file.name);
          const finalUrl = `${saveUrl}?storageId=${storageId}&filename=${filename}&source=local`;

          console.log(
            "[ea-ManagerPage] Redirecting to Save page with storage reference",
          );
          window.location.href = finalUrl;
        } catch (error) {
          console.error(
            "[ea-ManagerPage] Failed to read imported CSS file:",
            error,
          );
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

  // Memoize CSS file validation to avoid recreation on every render
  const isCssFile = useCallback((file: File): boolean => {
    return file.name.endsWith(".css") || file.name.endsWith(".user.css");
  }, []);

  // Memoize file processing logic
  const processCssFile = useCallback(async (cssFile: File): Promise<void> => {
    try {
      const cssContent = await cssFile.text();
      const storageId = `usercss_import_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      sessionStorage.setItem(storageId, cssContent);
      const saveUrl = browser.runtime.getURL("/save.html");
      const filename = encodeURIComponent(cssFile.name);
      const finalUrl = `${saveUrl}?storageId=${storageId}&filename=${filename}&source=local`;
      window.location.href = finalUrl;
    } catch (error) {
      console.error("[ea-ManagerPage] Failed to read CSS file:", error);
      setDragError("Failed to read the CSS file");
      setTimeout(() => {
        setIsDragOver(false);
        setDragError(null);
      }, 3000);
    }
  }, []);

  useEffect(() => {
    let dragCounter = 0; // Track multiple dragenter/dragleave events

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      if (e.dataTransfer?.types.includes("Files")) {
        dragCounter++;
        if (dragCounter === 1) {
          setIsDragOver(true);
          setDragError(null);
        }
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes("Files")) {
        dragCounter--;
        if (dragCounter === 0) {
          setIsDragOver(false);
          setDragError(null);
        }
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;

      if (e.dataTransfer) {
        const files = Array.from(e.dataTransfer.files);
        const cssFile = files.find(isCssFile);

        if (cssFile) {
          setDragError(null);
          processCssFile(cssFile);
        } else {
          setDragError(
            "Only CSS files (.css or .user.css) are supported. Please drag a valid CSS file.",
          );
          setTimeout(() => {
            setIsDragOver(false);
            setDragError(null);
          }, 3000);
        }
      } else {
        setIsDragOver(false);
      }
    };

    // Add event listeners to the document
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
  }, [isCssFile, processCssFile]); // Add stable dependencies

  // Extract meaningful domain from regexp pattern
  const extractDomainFromRegexp = (pattern: string): string => {
    try {
      // Try to extract domain from common URL patterns
      const urlPatterns = [
        // https://domain.com or http://domain.com
        /https?:\/\/([^/?#\\]+)/,
        // Escaped protocols: https\\:\\/\\/domain\\.com
        /https?\\\\:\\\\\/\\\\\/([^/?#\\]+)/,
        // Domain with optional protocol indicators
        /(?:https?\\?:)?\\?\/\\?\/?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
      ];

      for (const urlPattern of urlPatterns) {
        const match = pattern.match(urlPattern);
        if (match) {
          let hostname = match[1];
          // Clean up escaped characters
          hostname = hostname.replace(/\\+/g, "");
          // Remove regex groups and quantifiers
          hostname = hostname.replace(/\([^)]*\)[*+?]?/g, "");
          hostname = hostname.replace(/[[\]{}()*+?^$|\\]/g, "");
          hostname = hostname.replace(/^\*?\.+/, "");

          // Extract meaningful domain
          const parts = hostname
            .split(".")
            .filter((p) => p.length > 0 && !/^[*+?]$/.test(p));
          if (parts.length >= 2) {
            return parts.slice(-2).join(".");
          }
          if (hostname.length > 0) {
            return hostname;
          }
        }
      }

      // Try to find any domain-like pattern in the regex
      const domainPatterns = [
        // Standard domain pattern
        /([a-zA-Z0-9-]+\.[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})?)/,
        // Escaped domain pattern
        /([a-zA-Z0-9-]+\\\.?[a-zA-Z0-9-]+(?:\\\.?[a-zA-Z]{2,})?)/,
      ];

      for (const domainPattern of domainPatterns) {
        const match = pattern.match(domainPattern);
        if (match) {
          const domain = match[1].replace(/\\+/g, "");
          // Clean up and validate
          if (domain.includes(".") && domain.length > 3) {
            return domain;
          }
        }
      }

      // If nothing found, return a meaningful truncated version
      if (pattern.length > 20) {
        return `${pattern.substring(0, 17)}...`;
      }
      return pattern || "regexp";
    } catch {
      return pattern.length > 20 ? `${pattern.substring(0, 17)}...` : pattern;
    }
  };

  // Format domains for display
  const formatDomainsWithTruncation = (domains: UserCSSStyle["domains"]) => {
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
              return `starts with ${domain}`;
            } catch {
              return `starts with ${rule.pattern}`;
            }
          case "domain":
            return rule.pattern;
          case "regexp": {
            // Extract meaningful domain from regexp pattern
            const extractedDomain = extractDomainFromRegexp(rule.pattern);
            return `regexp: ${extractedDomain}`;
          }
          default:
            return rule.pattern;
        }
      })
      .join(", ");
  };

  // Format domains for display with shortened regexp
  const formatDomainsForDisplay = (domains: UserCSSStyle["domains"]) => {
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
              return `starts with ${domain}`;
            } catch {
              return `starts with ${rule.pattern}`;
            }
          case "domain":
            return rule.pattern;
          case "regexp": {
            // Extract meaningful domain from regexp pattern
            const extractedDomain = extractDomainFromRegexp(rule.pattern);
            return `regexp: ${extractedDomain}`;
          }
          default:
            return rule.pattern;
        }
      })
      .join(", ");
  };

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
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleImportClick}
          >
            <TransitionRight className="w-4 h-4 mr-2" />
            {t("manager_addUserCss")}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
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
            type="button"
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
                    <div title={`${style.name} by ${style.author}`}>
                      <h3 className="font-semibold truncate">
                        {formatStyleName(style.name)}
                      </h3>
                    </div>
                    <p
                      className="text-sm text-base-content/70 truncate"
                      title={style.description}
                    >
                      {style.description}
                    </p>
                    <p
                      className="text-xs text-base-content/50 truncate"
                      title={`by ${style.author} | ${formatDomainsWithTruncation(style.domains)}`}
                    >
                      by {style.author} |{" "}
                      {formatDomainsForDisplay(style.domains)}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-1">
                    {/* Configure Button - only show if variables exist and style is enabled */}
                    {Object.keys(style.variables).length > 0 &&
                      style.enabled && (
                        <button
                          type="button"
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
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        if (style.name.startsWith("[FONT] ")) {
                          // Handle font style editing
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
                          setEditingFontStyle(style);
                          setShowFontModal(true);
                        } else {
                          handleEditStyle(style);
                        }
                      }}
                      title="Edit style"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
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
                      <VariableControls
                        showTitle={false}
                        variables={Object.values(style.variables).map((v) => {
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
                        })}
                        onChange={(variableName, value) =>
                          handleVariableChange(style.id, variableName, value)
                        }
                      />
                    </div>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Font Style Modal */}
      <dialog
        ref={fontDialogRef}
        className="modal"
        onClose={() => setShowFontModal(false)}
      >
        <div className="modal-box max-w-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowFontModal(false);
                  setEditingFontStyle(null);
                  setFontDomain("");
                  setSelectedFont("");
                }}
                className="btn btn-ghost btn-sm p-2"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold">
                {editingFontStyle
                  ? t("font_editStyle")
                  : t("font_createFontStyle")}
              </h3>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!selectedFont) return;

                setIsSavingFont(true);
                try {
                  const messageType = editingFontStyle
                    ? SaveMessageType.UPDATE_FONT_STYLE
                    : SaveMessageType.CREATE_FONT_STYLE;
                  const payload = editingFontStyle
                    ? {
                        styleId: editingFontStyle.id,
                        domain: fontDomain || undefined,
                        fontName: selectedFont,
                      }
                    : {
                        domain: fontDomain || undefined,
                        fontName: selectedFont,
                      };

                  const result = await sendMessage(messageType, payload);

                  if ("success" in result && result.success) {
                    setShowFontModal(false);
                    setEditingFontStyle(null);
                    setFontDomain("");
                    setSelectedFont("");
                    setOriginalFontDomain("");
                    setOriginalSelectedFont("");
                    loadStyles(); // Refresh the styles list
                  } else {
                    const errorMsg =
                      "error" in result && result.error
                        ? result.error
                        : `Failed to ${editingFontStyle ? "update" : "create"} font style`;
                    throw new Error(errorMsg);
                  }
                } catch (error) {
                  console.error(
                    `[ea-ManagerPage] Failed to ${editingFontStyle ? "update" : "save"} font style:`,
                    error,
                  );
                } finally {
                  setIsSavingFont(false);
                }
              }}
              disabled={
                !selectedFont ||
                isSavingFont ||
                (editingFontStyle ? !hasFontChanges : false)
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

          <NewFontStyle
            domain={fontDomain}
            selectedFont={selectedFont}
            onDomainChange={setFontDomain}
            onFontChange={setSelectedFont}
            onClose={() => {
              setShowFontModal(false);
              setEditingFontStyle(null);
              setFontDomain("");
              setSelectedFont("");
              setOriginalFontDomain("");
              setOriginalSelectedFont("");
            }}
          />
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="button" onClick={() => setShowFontModal(false)}>
            Close
          </button>
        </form>
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
                <label className="label" htmlFor={styleNameId}>
                  <span className="label-text">Style Name</span>
                </label>
                <input
                  id={styleNameId}
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
                  id={namespaceId}
                  type="text"
                  value={editingNamespace}
                  onChange={(e) => setEditingNamespace(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="Enter namespace"
                />
              </div>

              <div>
                <label className="label" htmlFor={styleVersionId}>
                  <span className="label-text">Version</span>
                </label>
                <input
                  id={styleVersionId}
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
                  id={descriptionId}
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
                  id={authorId}
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
                  id={sourceUrlId}
                  type="text"
                  value={editingSourceUrl}
                  onChange={(e) => setEditingSourceUrl(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder="Enter source URL"
                />
              </div>

              <div>
                <label className="label" htmlFor={styleDomainsId}>
                  <span className="label-text">
                    Domains (CSS @-moz-document format)
                  </span>
                </label>
                <input
                  id={styleDomainsId}
                  type="text"
                  value={editingDomains}
                  onChange={(e) => setEditingDomains(e.target.value)}
                  className="input input-bordered w-full"
                  placeholder='@-moz-document domain("example.com"), url-prefix("https://example.org")'
                />
                <div className="text-xs text-base-content/70 mt-1">
                  Separate multiple rules with commas
                </div>
              </div>
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
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
