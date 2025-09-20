/**
 * Save Page UI Component
 *
 * Main UI component for the Save UserCSS page
 */

import React, { useState, useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { css } from "@codemirror/lang-css";
import { browser } from "@wxt-dev/browser";
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
  variables?: Record<string, any>;
}

interface ParseResult {
  meta: StyleMetadata;
  css: string;
  metadataBlock?: string;
  warnings: string[];
  errors: string[];
}

// Format domains for display
const formatDomainForDisplay = (domain: string, cssContent: string, metadataBlock?: string): string => {
  // Check both CSS content and metadata block for domain rules
  const fullContent = metadataBlock ? `${metadataBlock}\n${cssContent}` : cssContent;

  // Check if this domain came from a url-prefix rule by looking at the content
  const urlPrefixPattern = new RegExp(`url-prefix\\(["']?https?://[^"']*${domain.replace('.', '\\.')}`, 'i');
  if (urlPrefixPattern.test(fullContent)) {
    return `start with ${domain}`;
  }

  // Check if this domain came from a domain rule
  const domainPattern = new RegExp(`domain\\(["']?${domain.replace('.', '\\.')}`, 'i');
  if (domainPattern.test(fullContent)) {
    return domain;
  }

  // Default fallback
  return domain;
};

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
        // Combine metadata block and CSS content for display
        const displayContent = parseResult.metadataBlock
          ? `${parseResult.metadataBlock}\n\n${parseResult.css}`
          : parseResult.css;

        editorViewRef.current = new EditorView({
          doc: displayContent,
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
      // Combine metadata block and CSS content for display
      const displayContent = parseResult.metadataBlock
        ? `${parseResult.metadataBlock}\n\n${parseResult.css}`
        : parseResult.css;

      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: displayContent,
        },
      });
    }
  }, [parseResult]);

  // Load and parse UserCSS content
  useEffect(() => {
    const loadUserCSS = async (): Promise<void> => {
      try {
        // Guard against running in non-browser context
        if (typeof window === 'undefined' || !window.location) {
          console.warn('Window not available, skipping UserCSS loading');
          setError('Page not fully loaded. Please refresh and try again.');
          setLoading(false);
          return;
        }

        // Guard against browser API not being available
        if (typeof browser === 'undefined' || !browser.storage) {
          console.warn('Browser APIs not available, skipping UserCSS loading');
          setError('Extension context not available. Please refresh and try again.');
          setLoading(false);
          return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const storageId = urlParams.get("storageId");
        const cssContent = urlParams.get("css");
        const userCssUrl = urlParams.get("url");
        const source = urlParams.get("source");

        let cssText: string;
        let sourceUrl: string;

        if (storageId) {
          const storageType = urlParams.get("storage") || "session";

          if (storageType === "local") {
            // Content stored in browser local storage (for external files)
            try {
              const storedData = await browser.storage.local.get(storageId);
              const data = storedData[storageId];
              if (!data || !data.content) {
                throw new Error("CSS content not found in browser storage");
              }
              cssText = data.content;
              sourceUrl = data.sourceUrl || urlParams.get("sourceUrl") || urlParams.get("filename") || "external file";

              // Clean up the storage after retrieving
              await browser.storage.local.remove(storageId);

              console.log(
                "Loading UserCSS from browser storage, length:",
                cssText.length,
                "source:",
                source,
              );
            } catch (error) {
              console.error("Failed to read from browser storage:", error);
              throw new Error("CSS content not found in browser storage");
            }
          } else {
            // Content stored in sessionStorage (for local files)
            cssText = sessionStorage.getItem(storageId) || "";
            if (!cssText) {
              throw new Error("CSS content not found in sessionStorage");
            }
            // Clean up the storage after retrieving
            sessionStorage.removeItem(storageId);
            sourceUrl =
              urlParams.get("sourceUrl") ||
              urlParams.get("filename") ||
              "local file";
            console.log(
              "Loading UserCSS from sessionStorage, length:",
              cssText.length,
              "source:",
              source,
            );
          }
        } else if (cssContent) {
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
            metadataBlock: parseResponse.metadataBlock,
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
    if (typeof document !== 'undefined' && document.referrer) {
      setCanGoBack(true);
    } else {
      setCanGoBack(false);
    }

    loadUserCSS();
  }, [parseUserCSS]);

  const handleInstall = async () => {
    if (!parseResult) return;

    try {
      setLoading(true); // Show loading state during installation

      // Extract variables from the parsed result
      const variables = parseResult.meta.variables
        ? Object.values(parseResult.meta.variables).map(variable => ({
            name: variable.name,
            type: variable.type,
            default: variable.default,
            min: variable.min,
            max: variable.max,
            options: variable.options,
          }))
        : [];

      const response = await installStyle(
        parseResult.meta,
        parseResult.css,
        variables,
      );

      if (response.success) {
        // Show success message
        setError(null); // Clear any previous errors

        // Show success toast with better styling
        if (typeof document !== 'undefined' && document.createElement && document.body) {
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
        }

        // Don't close immediately - let user see the success message
        setTimeout(() => {
          if (canGoBack && typeof window !== 'undefined' && window.history) {
            window.history.back();
          } else if (typeof window !== 'undefined' && window.close) {
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
    if (canGoBack && typeof window !== 'undefined' && window.history) {
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
                if (canGoBack && typeof window !== 'undefined' && window.history) {
                  window.history.back();
                } else if (typeof window !== 'undefined' && window.close) {
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
                    {parseResult.meta.domains.length > 0 ? (
                      parseResult.meta.domains.map((domain, index) => (
                        <span key={index} className="badge badge-primary">
                          {formatDomainForDisplay(domain, parseResult.css, parseResult.metadataBlock)}
                        </span>
                      ))
                    ) : (
                      <span className="text-base-content/50">No specific domains detected</span>
                    )}
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
              <p className="text-sm text-base-content/70 mb-4">
                Shows the complete UserCSS content including metadata block with variables and CSS rules.
              </p>
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
