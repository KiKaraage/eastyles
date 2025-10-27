/**
 * Edit Page UI Component
 *
 * Main UI component for the Edit UserCSS page
 */

import { css } from "@codemirror/lang-css";
import { Compartment } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import { FloppyDisk, Settings } from "iconoir-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VariableControls } from "../../components/features/VariableControls";
import { useEditActions, useSaveActions } from "../../hooks/useMessage";
import { useTheme } from "../../hooks/useTheme";
import type { VariableDescriptor } from "../../services/usercss/types";

// Define types for our data
interface StyleMetadata {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author: string;
  sourceUrl: string;
  domains: string[];
  variables?: Record<string, VariableDescriptor>;
  license?: string;
  homepageURL?: string;
  supportURL?: string;
}

interface ParseResult {
  meta: StyleMetadata;
  css: string;
  metadataBlock?: string;
  variables?: Record<string, VariableDescriptor>;
  warnings: string[];
  errors: string[];
}

const EditPage: React.FC = () => {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [title, setTitle] = useState<string>("");
  const [cssContent, setCssContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [editorInitialized, setEditorInitialized] = useState<boolean>(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef<Compartment>(new Compartment());
  const cssContentRef = useRef<string>(cssContent);

  const { parseUserCSS } = useSaveActions();
  const { getStyleForEdit, updateStyle } = useEditActions();
  const { effectiveTheme } = useTheme();

  // Load style data from URL parameters
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentional empty deps to run only once
  useEffect(() => {
    const loadStyle = async (): Promise<void> => {
      try {
        // Guard against running in non-browser context
        if (typeof window === "undefined" || !window.location) {
          console.warn("[ea] Window not available, skipping style loading");
          setError("Page not fully loaded. Please refresh and try again.");
          setLoading(false);
          return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const id = urlParams.get("styleId");

        if (!id) {
          setError("No style ID provided");
          setLoading(false);
          return;
        }

        setStyleId(id);

        // Load style from storage using message passing
        const styleResponse = await getStyleForEdit(id);

        if (
          styleResponse &&
          typeof styleResponse === "object" &&
          styleResponse.success &&
          styleResponse.style
        ) {
          const { style } = styleResponse;

          console.log("[ea-EditPage] Received style:", {
            name: style.name,
            cssLength: style.css?.length || 0,
          });
          setTitle(style.name);
          setCssContent(style.css);

          // If we have source CSS, parse it for metadata
          // If not, use the stored metadata directly
          if (style.css && style.css.includes("==UserStyle==")) {
            // This is source CSS with metadata, parse it
            const parseResponse = await parseUserCSS(style.css, "edit://local");

            if (
              parseResponse &&
              typeof parseResponse === "object" &&
              parseResponse.success &&
              parseResponse.meta &&
              parseResponse.css
            ) {
              const result = {
                meta: {
                  ...parseResponse.meta,
                  domains: parseResponse.meta.domains || [],
                },
                css: parseResponse.css,
                metadataBlock: parseResponse.metadataBlock,
                variables:
                  (
                    parseResponse as {
                      variables?: Record<string, VariableDescriptor>;
                    }
                  ).variables || {},
                warnings: parseResponse.warnings || [],
                errors: parseResponse.errors || [],
              };

              setParseResult(result);
              document.title = `Edit UserCSS: ${result.meta.name}`;
            } else {
              setError("Failed to parse UserCSS");
            }
          } else {
            // This is compiled CSS without metadata, use stored metadata
            const result = {
              meta: {
                name: style.meta.name || "Untitled Style",
                namespace: style.meta.namespace || "https://example.com",
                version: style.meta.version || "1.0.0",
                description: style.meta.description || "",
                author: style.meta.author || "Unknown",
                sourceUrl: style.meta.sourceUrl || "",
                domains: style.meta.domains || [],
                variables: style.meta.variables || {},
              },
              css: style.css || "",
              metadataBlock: "",
              variables: style.meta.variables || {},
              warnings: [],
              errors: [],
            };

            setParseResult(result);
            document.title = `Edit UserCSS: ${result.meta.name}`;
          }
        } else {
          setError(styleResponse?.error || "Failed to load style");
        }
      } catch (loadError) {
        console.error("[ea-EditPage] Error loading style:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unknown error occurred",
        );
      } finally {
        setLoading(false);
      }
    };

    loadStyle();
  }, []); // Empty dependency array to run only once on mount

  // Skip real-time parsing during editing - metadata is already parsed on load
  // This avoids unnecessary background processing that fails due to DOM dependencies

  // Initialize CodeMirror editor
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally exclude effectiveTheme to avoid recreating editor
  useEffect(() => {
    // Use a timeout to ensure DOM is fully ready
    const initTimer = setTimeout(() => {
      console.log("[ea] CodeMirror init check:", {
        hasCssContent: !!cssContent,
        hasEditorRef: !!editorRef.current,
        hasEditorView: !!editorViewRef.current,
        cssLength: cssContent?.length,
        cssContentValue:
          cssContent.substring(0, 50) + (cssContent.length > 50 ? "..." : ""),
      });

      // Only initialize if we have content, a container that's mounted, and haven't initialized yet
      if (!cssContent || !editorRef.current || editorViewRef.current) {
        console.log("[ea] CodeMirror init skipped:", {
          hasCssContent: !!cssContent,
          hasEditorRef: !!editorRef.current,
          hasEditorView: !!editorViewRef.current,
          cssLength: cssContent?.length,
          cssContentStartsWith: cssContent.substring(0, 20),
        });
        return;
      }

      console.log(
        "[ea] Initializing CodeMirror editor with content length:",
        cssContent.length,
      );

      try {
        const themeExtension = EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "14px",
            backgroundColor:
              effectiveTheme === "dark" ? "hsl(var(--b3))" : "hsl(var(--b2))",
          },
          ".cm-content": {
            fontFamily:
              'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace',
            backgroundColor:
              effectiveTheme === "dark" ? "hsl(var(--b3))" : "hsl(var(--b2))",
          },
          ".cm-scroller": {
            height: "100%",
            overflow: "auto",
            backgroundColor:
              effectiveTheme === "dark" ? "hsl(var(--b3))" : "hsl(var(--b2))",
          },
          ".cm-line": {
            backgroundColor: "transparent",
          },
          ".cm-focused": {
            outline: "none",
          },
        });

        editorViewRef.current = new EditorView({
          doc: cssContent,
          extensions: [
            basicSetup,
            css(),
            themeCompartmentRef.current.of(themeExtension),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                // Keep ref in sync with editor content
                cssContentRef.current = update.state.doc.toString();
              }
            }),
          ],
          parent: editorRef.current,
        });

        console.log("[ea] CodeMirror editor initialized successfully");
        setEditorInitialized(true);
      } catch (error) {
        console.error("[ea] Failed to initialize CodeMirror editor:", error);
      }
    }, 100); // Timeout to ensure DOM is ready

    return () => {
      clearTimeout(initTimer);
      if (
        editorViewRef.current &&
        typeof editorViewRef.current.destroy === "function"
      ) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
        setEditorInitialized(false);
      }
    };
  }, [cssContent]); // Only depend on cssContent for initialization

  // Keep cssContentRef in sync with cssContent for fallback in save/validation
  useEffect(() => {
    cssContentRef.current = cssContent;
  }, [cssContent]);

  // Update theme when effectiveTheme changes
  useEffect(() => {
    if (!editorViewRef.current) return;

    const themeExtension = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "14px",
        backgroundColor:
          effectiveTheme === "dark" ? "hsl(var(--b3))" : "hsl(var(--b2))",
      },
      ".cm-content": {
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace',
        backgroundColor:
          effectiveTheme === "dark" ? "hsl(var(--b3))" : "hsl(var(--b2))",
      },
      ".cm-scroller": {
        height: "100%",
        overflow: "auto",
        backgroundColor:
          effectiveTheme === "dark" ? "hsl(var(--b3))" : "hsl(var(--b2))",
      },
      ".cm-line": {
        backgroundColor: "transparent",
      },
      ".cm-focused": {
        outline: "none",
      },
    });

    editorViewRef.current.dispatch({
      effects: themeCompartmentRef.current.reconfigure(themeExtension),
    });
  }, [effectiveTheme]);

  const handleCancel = (): void => {
    // Navigate to manager page instead of closing tab
    if (typeof browser !== "undefined" && browser.runtime?.getURL) {
      window.location.href = browser.runtime.getURL("manager.html");
    }
    // Don't close tab if navigation fails
  };

  // Memoized variables extraction to avoid recalculating on every render
  const extractedVariables = useMemo(() => {
    if (!parseResult?.variables) return [];

    return Object.values(parseResult.variables).map((variable) => ({
      name: variable.name,
      type: variable.type,
      default: variable.default,
      min: variable.min,
      max: variable.max,
      options: variable.options,
      optionCss: variable.optionCss,
    }));
  }, [parseResult?.variables]);

  // Memoized validation checks
  const validationErrors = useMemo(() => {
    const errors = [];
    if (!title.trim()) errors.push("Style name cannot be empty");

    // Get current CSS content for validation
    const currentCssContent = editorViewRef.current
      ? editorViewRef.current.state.doc.toString()
      : cssContentRef.current;

    if (!currentCssContent.trim()) errors.push("CSS content cannot be empty");
    if (parseResult?.errors && parseResult.errors.length > 0)
      errors.push("Please fix CSS errors before saving");
    return errors;
  }, [title, parseResult?.errors]); // Remove cssContent dependency since we get it dynamically

  const handleSave = async () => {
    if (!parseResult || !styleId) return;

    // Use memoized validation
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Get current CSS content from editor
      const currentCssContent = editorViewRef.current
        ? editorViewRef.current.state.doc.toString()
        : cssContentRef.current;

      const response = await updateStyle(
        styleId,
        title.trim(),
        currentCssContent,
        parseResult.meta,
        extractedVariables,
        currentCssContent, // Use current CSS content as source
      );

      if (response.success) {
        // Show success message - skip in test environment
        if (
          typeof document !== "undefined" &&
          document.createElement &&
          document.body &&
          process.env.NODE_ENV !== "test"
        ) {
          const successToast = document.createElement("div");
          successToast.className = "toast toast-top toast-end z-50";
          successToast.innerHTML = `
            <div class="alert alert-success shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 class="font-bold">Success!</h3>
                <div class="text-xs">Style "${title}" saved successfully</div>
              </div>
            </div>
          `;
          document.body.appendChild(successToast);

          // Remove toast after 4 seconds
          setTimeout(() => {
            if (successToast.parentNode) {
              successToast.parentNode.removeChild(successToast);
            }
          }, 4000);
        }
      } else {
        setError(response.error || "Failed to save style");
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save style",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading style...</div>
      </div>
    );
  }

  if (error && !parseResult) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-500">{error}</div>
      </div>
    );
  }

  if (!parseResult) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">No style data found</div>
      </div>
    );
  }

  const hasErrors = parseResult.errors && parseResult.errors.length > 0;
  const hasVariables =
    parseResult.variables &&
    Object.keys(parseResult.variables || {}).length > 0;

  return (
    <div className="h-screen p-7 flex flex-col overflow-hidden">
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Header Div */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Eastyles Logo" className="w-8 h-8" />
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-bold bg-transparent border-none outline-none focus:ring-2 focus:ring-primary rounded px-2 py-1"
              placeholder="Style name"
            />
          </div>
          <div className="flex items-center gap-2">
            {hasVariables && (
              <div className="dropdown dropdown-end">
                <div
                  tabIndex={0}
                  role="button"
                  className="btn btn-ghost btn-sm"
                  title="Set Variables"
                >
                  <Settings className="w-4 h-4" />
                </div>
                <ul className="dropdown-content menu bg-base-100 rounded-box z-[1] w-96 max-w-sm p-3 shadow-lg max-h-96 overflow-y-auto">
                  <div className="p-2">
                    <VariableControls
                      showTitle={false}
                      variables={Object.values(parseResult.variables || {})}
                      onChange={(name, value) => {
                        // Create new parseResult with updated variable - avoid direct mutation
                        if (parseResult.variables) {
                          const updatedVariables = {
                            ...parseResult.variables,
                            [name]: {
                              ...parseResult.variables[name],
                              value,
                            },
                          };
                          setParseResult({
                            ...parseResult,
                            variables: updatedVariables,
                          });
                        }
                      }}
                    />
                  </div>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Error from save */}
        {error && (
          <div className="alert alert-error">
            <div>
              <h3 className="font-bold">Save Error</h3>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Warnings and Errors */}
        {parseResult.warnings.length > 0 && (
          <div className="alert alert-warning">
            <div>
              <h3 className="font-bold">Warnings</h3>
              <ul className="list-disc list-inside mt-2">
                {parseResult.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {parseResult.errors.length > 0 && (
          <div className="alert alert-error">
            <div>
              <h3 className="font-bold">Errors</h3>
              <ul className="list-disc list-inside mt-2">
                {parseResult.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* CodeMirror Div */}
        <div className="flex-1 border border-base-300 rounded-lg overflow-hidden relative min-h-0">
          <div
            ref={editorRef}
            className="absolute inset-0"
            style={{
              backgroundColor: editorInitialized ? "transparent" : "#f0f0f0",
              color: editorInitialized ? "inherit" : "#666",
              padding: editorInitialized ? "0" : "1rem",
              fontFamily: editorInitialized ? "inherit" : "monospace",
            }}
          >
            {!editorInitialized && cssContent && (
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {cssContent}
              </pre>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={handleCancel}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`btn btn-primary ${hasErrors ? "btn-disabled" : ""}`}
            disabled={hasErrors || saving}
          >
            {saving ? (
              <>
                <span className="loading loading-spinner loading-sm mr-2"></span>
                Saving...
              </>
            ) : (
              <>
                <FloppyDisk className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPage;
