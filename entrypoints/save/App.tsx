/**
 * Save Page UI Component
 *
 * Main UI component for the Save UserCSS page
 */

import React, { useState, useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { css } from "@codemirror/lang-css";
import { useSaveActions } from "../../hooks/useMessage";

// Define types for our data
interface StyleMetadata {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author: string;
  sourceUrl: string;
  domains: string[];
}

interface ParseResult {
  meta: StyleMetadata;
  css: string;
  warnings: string[];
  errors: string[];
}

const SavePage: React.FC = () => {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const { parseUserCSS, installStyle } = useSaveActions();

  // Initialize CodeMirror editor
  useEffect(() => {
    if (parseResult && editorRef.current && !editorViewRef.current) {
      try {
        editorViewRef.current = new EditorView({
          doc: parseResult.css,
          extensions: [
            basicSetup,
            css(),
            EditorView.editable.of(false), // Read-only
            EditorView.theme({
              "&": {
                height: "400px",
                fontSize: "14px",
              },
              ".cm-content": {
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace',
              },
            }),
          ],
          parent: editorRef.current,
        });
      } catch (error) {
        // In test environment, EditorView might not be available
        console.warn("EditorView not available in test environment:", error);
      }
    }

    return () => {
      if (
        editorViewRef.current &&
        typeof editorViewRef.current.destroy === "function"
      ) {
        editorViewRef.current.destroy();
        editorViewRef.current = null;
      }
    };
  }, [parseResult]);

  // Update editor content when parseResult changes
  useEffect(() => {
    if (
      editorViewRef.current &&
      parseResult &&
      editorViewRef.current.state?.doc
    ) {
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: parseResult.css,
        },
      });
    }
  }, [parseResult]);

  // Load and parse UserCSS content
  useEffect(() => {
    const loadUserCSS = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const cssContent = urlParams.get("css");
        const userCssUrl = urlParams.get("url");
        const source = urlParams.get("source");

        let cssText: string;
        let sourceUrl: string;

        if (cssContent) {
          // Content passed directly (for local files or CORS-restricted external URLs)
          const encoding = urlParams.get("encoding");
          if (encoding === "base64") {
            cssText = decodeURIComponent(atob(cssContent));
          } else {
            cssText = decodeURIComponent(cssContent);
          }
          sourceUrl =
            urlParams.get("sourceUrl") ||
            urlParams.get("filename") ||
            "local file";
          console.log(
            "Loading UserCSS from direct content, length:",
            cssText.length,
            "source:",
            source,
            "encoding:",
            encoding,
          );
        } else if (userCssUrl) {
          // Need to fetch from URL
          console.log("Loading UserCSS from URL:", userCssUrl);

          try {
            const fetchResponse = await fetch(userCssUrl);
            if (!fetchResponse.ok) {
              throw new Error(
                `Failed to fetch UserCSS: ${fetchResponse.status} ${fetchResponse.statusText}`,
              );
            }
            cssText = await fetchResponse.text();
            sourceUrl = userCssUrl;
            console.log("Fetched UserCSS content, length:", cssText.length);
          } catch (fetchError) {
            // If fetch fails (likely CORS), show helpful error
            console.error("Failed to fetch UserCSS:", fetchError);
            setError(
              "Unable to load UserCSS from external URL due to browser security restrictions. " +
                "Try downloading the file and importing it locally instead.",
            );
            setLoading(false);
            return;
          }
        } else {
          // No content or URL provided
          setError("No UserCSS content or URL provided");
          setLoading(false);
          return;
        }

        // Parse the UserCSS
        console.log(
          "Calling parseUserCSS with text length:",
          cssText.length,
          "sourceUrl:",
          sourceUrl,
        );
        const parseResponse = await parseUserCSS(cssText, sourceUrl);
        console.log("parseUserCSS response:", parseResponse);
        console.log("parseResponse type:", typeof parseResponse);
        console.log("parseResponse.success:", parseResponse?.success);

        if (
          parseResponse &&
          typeof parseResponse === "object" &&
          parseResponse.success &&
          parseResponse.meta &&
          parseResponse.css
        ) {
          setParseResult({
            meta: {
              ...parseResponse.meta,
              domains: parseResponse.meta.domains || [],
            },
            css: parseResponse.css,
            warnings: parseResponse.warnings || [],
            errors: parseResponse.errors || [],
          });
        } else {
          console.error(
            "ParseUserCSS failed or returned invalid response:",
            parseResponse,
          );
          if (typeof parseResponse === "boolean") {
            setError(
              "Failed to parse UserCSS: received boolean response instead of data",
            );
          } else {
            setError(
              (parseResponse as { error?: string })?.error ||
                "Failed to parse UserCSS",
            );
          }
        }
      } catch (loadError) {
        console.error("Error loading UserCSS:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unknown error occurred",
        );
      } finally {
        setLoading(false);
      }
    };

    // Check if we can go back (document.referrer exists)
    setCanGoBack(!!document.referrer);

    loadUserCSS();
  }, [parseUserCSS]); // Include parseUserCSS to satisfy dependency rule

  const handleInstall = async () => {
    if (!parseResult) return;

    try {
      setLoading(true); // Show loading state during installation

      const response = await installStyle(
        parseResult.meta,
        parseResult.css,
        [], // TODO: Extract variables from CSS
      );

      if (response.success) {
        // Show success message
        setError(null); // Clear any previous errors

        // Show success toast with better styling
        const successToast = document.createElement("div");
        successToast.className = "toast toast-top toast-end z-50";
        successToast.innerHTML = `
          <div class="alert alert-success shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 class="font-bold">Success!</h3>
              <div class="text-xs">Style "${parseResult.meta.name}" installed successfully</div>
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

        // Don't close immediately - let user see the success message
        setTimeout(() => {
          if (canGoBack) {
            window.history.back();
          } else {
            // Try to close the window, but handle the error gracefully
            try {
              window.close();
            } catch {
              console.log("Could not close window");
            }
          }
        }, 2000);
      } else {
        setError(response.error || "Failed to install style");
      }
    } catch (installError) {
      setError(
        installError instanceof Error
          ? installError.message
          : "Failed to install style",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (canGoBack) {
      window.history.back();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading UserCSS...</div>
      </div>
    );
  }

  if (!parseResult) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-500">
          {error || "Failed to load UserCSS"}
        </div>
      </div>
    );
  }

  const hasErrors = parseResult.errors.length > 0;

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-base-content">
                Save UserCSS
              </h1>
              <p className="text-base-content/70 mt-2">
                Preview and install UserCSS styles
              </p>
            </div>
            <button
              onClick={() => {
                if (canGoBack) {
                  window.history.back();
                } else {
                  try {
                    window.close();
                  } catch {
                    console.log("Could not close window");
                  }
                }
              }}
              className="btn btn-ghost btn-sm"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Metadata Panel */}
          <div className="card bg-base-100 shadow-sm border">
            <div className="card-body p-6">
              <h2 className="card-title text-xl mb-4">Style Information</h2>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">Name</h3>
                  <p>{parseResult.meta.name}</p>
                </div>

                <div>
                  <h3 className="font-semibold">Description</h3>
                  <p>{parseResult.meta.description}</p>
                </div>

                <div>
                  <h3 className="font-semibold">Author</h3>
                  <p>{parseResult.meta.author}</p>
                </div>

                <div>
                  <h3 className="font-semibold">Version</h3>
                  <p>{parseResult.meta.version}</p>
                </div>

                <div>
                  <h3 className="font-semibold">Target Domains</h3>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {parseResult.meta.domains.map((domain, index) => (
                      <span key={index} className="badge badge-primary">
                        {domain}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="alert alert-warning mt-4">
                  <h3 className="font-semibold">Warnings</h3>
                  <ul className="list-disc pl-5 mt-2">
                    {parseResult.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {hasErrors && (
                <div className="alert alert-error mt-4">
                  <h3 className="font-semibold">Errors</h3>
                  <ul className="list-disc pl-5 mt-2">
                    {parseResult.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <div className="alert alert-error mt-4">
                  <h3 className="font-semibold">Installation Error</h3>
                  <p>{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Code Preview */}
          <div className="card bg-base-100 shadow-sm border">
            <div className="card-body p-6">
              <h2 className="card-title text-xl mb-4">Code Preview</h2>
              <div className="bg-base-300 rounded-lg overflow-hidden border">
                <div ref={editorRef} className="min-h-[400px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-base-300">
          <button
            onClick={handleCancel}
            className={`btn btn-ghost ${!canGoBack ? "btn-disabled opacity-50" : ""}`}
            disabled={!canGoBack}
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            className={`btn btn-primary ${hasErrors || loading ? "btn-disabled loading" : ""}`}
            disabled={hasErrors || loading}
          >
            {loading ? "Installing..." : "Add to Eastyles"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SavePage;
