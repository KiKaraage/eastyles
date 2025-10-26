/**
 * Save Page UI Component
 *
 * Main UI component for the Save UserCSS page
 */

import { css } from "@codemirror/lang-css";
import { basicSetup, EditorView } from "codemirror";
import { ArrowUpRight, FloppyDisk, Settings } from "iconoir-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { VariableControls } from "../../components/features/VariableControls";
import { useSaveActions } from "../../hooks/useMessage";
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

// Extract simplified domain name from regexp pattern
const extractDomainFromRegexp = (pattern: string): string => {
  try {
    // First, try to extract domain from common URL patterns
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
    if (pattern.length > 25) {
      return `${pattern.substring(0, 22)}...`;
    }
    return pattern || "regexp";
  } catch {
    return pattern.length > 25 ? `${pattern.substring(0, 22)}...` : pattern;
  }
};

// Format domains for display
const formatDomainForDisplay = (
  domain: string,
  cssContent: string,
  metadataBlock?: string,
): string => {
  // Handle regexp-prefixed domains from inline parser
  if (domain.startsWith("regexp:")) {
    const regexpPattern = domain.substring(7);
    const extracted = extractDomainFromRegexp(regexpPattern);
    return `regexp: ${extracted}`;
  }

  // Check both CSS content and metadata block for domain rules
  const fullContent = metadataBlock
    ? `${metadataBlock}\n${cssContent}`
    : cssContent;

  // Check if this domain came from a regexp rule
  const regexpPatterns = [
    new RegExp(
      `regexp\\(["']?[^"']*${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"']*["']?\\)`,
      "i",
    ),
    new RegExp(
      `regexp\\(["']?${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    ),
  ];

  for (const pattern of regexpPatterns) {
    if (pattern.test(fullContent)) {
      // Try to extract the full regexp pattern for better display
      const regexpMatch = fullContent.match(/regexp\(["']?([^"')]+)["']?\)/i);
      if (regexpMatch) {
        const fullPattern = regexpMatch[1];
        const simplifiedDomain = extractDomainFromRegexp(fullPattern);
        return `regexp: ${simplifiedDomain}`;
      }
      return `regexp: ${domain}`;
    }
  }

  // Check if this domain came from a url-prefix rule
  const urlPrefixPattern = new RegExp(
    `url-prefix\\(["']?https?://[^"']*${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i",
  );
  if (urlPrefixPattern.test(fullContent)) {
    return `starts with ${domain}`;
  }

  // Check if this domain came from a domain rule
  const domainPattern = new RegExp(
    `domain\\(["']?${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i",
  );
  if (domainPattern.test(fullContent)) {
    return domain;
  }

  // Check for URL exact match
  const urlPattern = new RegExp(
    `url\\(["']?https?://[^"']*${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "i",
  );
  if (urlPattern.test(fullContent)) {
    return `exact: ${domain}`;
  }

  // Default fallback
  return domain;
};

const SavePage: React.FC = () => {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [originalSource, setOriginalSource] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const { parseUserCSS, installStyle } = useSaveActions();
  const { effectiveTheme } = useTheme();

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
                height: "100%",
                fontSize: "14px",
                backgroundColor:
                  effectiveTheme === "dark"
                    ? "hsl(var(--b3))"
                    : "hsl(var(--b2))",
              },
              ".cm-content": {
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace',
                backgroundColor:
                  effectiveTheme === "dark"
                    ? "hsl(var(--b3))"
                    : "hsl(var(--b2))",
              },
              ".cm-scroller": {
                height: "100%",
                overflow: "auto",
                backgroundColor:
                  effectiveTheme === "dark"
                    ? "hsl(var(--b3))"
                    : "hsl(var(--b2))",
              },
              ".cm-line": {
                backgroundColor: "transparent",
              },
              ".cm-focused": {
                outline: "none",
              },
            }),
          ],
          parent: editorRef.current,
        });
      } catch (error) {
        // In test environment, EditorView might not be available
        console.warn(
          "[ea] EditorView not available in test environment:",
          error,
        );
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
  }, [parseResult, effectiveTheme]);

  // Load and parse UserCSS content
  useEffect(() => {
    const loadUserCSS = async (): Promise<void> => {
      try {
        // Guard against running in non-browser context
        if (typeof window === "undefined" || !window.location) {
          console.warn("[ea] Window not available, skipping UserCSS loading");
          setError("Page not fully loaded. Please refresh and try again.");
          setLoading(false);
          return;
        }

        // Guard against browser API not being available
        if (typeof browser === "undefined" || !browser.storage) {
          console.warn(
            "[ea] Browser APIs not available, skipping UserCSS loading",
          );
          setError(
            "Extension context not available. Please refresh and try again.",
          );
          setLoading(false);
          return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const storageId = urlParams.get("storageId");
        const cssContent = urlParams.get("css");
        const userCssUrl = urlParams.get("url");
        const source = urlParams.get("source");

        let cssText: string = "";
        let sourceUrl: string = "";

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
              sourceUrl =
                data.sourceUrl ||
                urlParams.get("sourceUrl") ||
                urlParams.get("filename") ||
                "external file";

              // Clean up the storage after retrieving
              await browser.storage.local.remove(storageId);

              console.log(
                "[ea] Loading UserCSS from browser storage, length:",
                cssText.length,
                "source:",
                source,
              );
            } catch (installError) {
              setError(
                installError instanceof Error
                  ? installError.message
                  : "Failed to install style",
              );
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
              "[ea] Loading UserCSS from sessionStorage, length:",
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
            "[ea] Loading UserCSS from direct content, length:",
            cssText.length,
            "source:",
            source,
            "encoding:",
            encoding,
          );
        } else if (userCssUrl) {
          // Need to fetch from URL
          console.log("[ea] Loading UserCSS from URL:", userCssUrl);

          try {
            const fetchResponse = await fetch(userCssUrl);
            if (!fetchResponse.ok) {
              throw new Error(
                `Failed to fetch UserCSS: ${fetchResponse.status} ${fetchResponse.statusText}`,
              );
            }
            cssText = await fetchResponse.text();
            sourceUrl = userCssUrl;
            console.log(
              "[ea] Fetched UserCSS content, length:",
              cssText.length,
            );
          } catch (fetchError) {
            // If fetch fails (likely CORS), show helpful error
            console.error("[ea] Failed to fetch UserCSS:", fetchError);
            setError(
              "Unable to load UserCSS from external URL due to browser security restrictions. " +
                "Try downloading the file and importing it locally instead.",
            );
            setLoading(false);
            return;
          }
        } else {
          // No content or URL provided - use fallback example
          cssText = `/* ==UserStyle==
@name        Example Style
@namespace   example.com
@version     1.0.0
@description An example UserCSS style for demonstration
@author      Example Author
@homepageURL https://example.com
@supportURL  https://example.com/support
@license     MIT
@preprocessor default
==/UserStyle== */

@-moz-document domain("example.com") {
  body {
    background-color: #ffffff;
  }
}`;
          sourceUrl = "https://example.com/style.user.css";
        }

        // Store the original source for later use
        setOriginalSource(cssText);

        // Parse the UserCSS
        console.log(
          "[ea] Calling parseUserCSS with text length:",
          cssText.length,
          "sourceUrl:",
          sourceUrl,
        );
        const parseResponse = await parseUserCSS(cssText, sourceUrl);
        console.log("[ea] parseUserCSS response:", parseResponse);
        console.log("[ea] parseResponse type:", typeof parseResponse);
        console.log("[ea] parseResponse.success:", parseResponse?.success);

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

          // Set dynamic page title
          const version = result.meta.version || "0.1.0";
          document.title = `Save UserCSS: ${result.meta.name} v${version}`;
        } else {
          console.error(
            "[ea-SavePage] ParseUserCSS failed or returned invalid response:",
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
        console.error("[ea-SavePage] Error loading UserCSS:", loadError);
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
    // Note: Not used in current implementation

    loadUserCSS();
  }, [parseUserCSS]);

  const handleCancel = (): void => {
    if (document.referrer) {
      window.history.back();
    }
  };

  const handleInstall = async () => {
    if (!parseResult) return;

    try {
      // Extract variables from the parsed result
      const variables = parseResult.variables
        ? Object.values(parseResult.variables || {}).map((variable) => ({
            name: variable.name,
            type: variable.type,
            default: variable.default,
            min: variable.min,
            max: variable.max,
            options: variable.options,
            optionCss: variable.optionCss, // Include optionCss for USO dropdown variables
          }))
        : [];

      console.log(
        "[ea-SavePage] Installing style with source length:",
        originalSource?.length || 0,
      );
      const response = await installStyle(
        parseResult.meta,
        parseResult.css,
        variables,
        originalSource, // Include original source for preprocessor detection
      );

      if (response.success) {
        // Show success message
        setError(null); // Clear any previous errors

        // Show success toast with better styling
        if (
          typeof document !== "undefined" &&
          document.createElement &&
          document.body
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

        // Auto-close the page after 2 seconds for successful installation
        setTimeout(() => {
          if (typeof window !== "undefined" && window.close) {
            window.close();
            // Fallback: try to navigate back if close fails
            setTimeout(() => {
              if (typeof window !== "undefined" && window.history.back) {
                window.history.back();
              }
            }, 100);
          }
        }, 2000);

        // Keep the page open so user can see the code
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

  if (!parseResult) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {loading ? (
          <div className="text-xl">Loading UserCSS...</div>
        ) : (
          <div className="text-xl text-red-500">
            {error || "Failed to load UserCSS"}
          </div>
        )}
      </div>
    );
  }

  const hasErrors = parseResult.errors.length > 0;
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
            <h1 className="text-xl font-bold">{parseResult.meta.name}</h1>
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
                        // Update variable in parseResult
                        if (parseResult.variables) {
                          parseResult.variables[name].value = value;
                          setParseResult({ ...parseResult });
                        }
                      }}
                    />
                  </div>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Metadata Div */}
        <div className="space-y-2">
          {/* Line 1: Author, Version, License, Description (lg screens) */}
          <div className="flex items-center gap-2 text-sm">
            {parseResult.meta.author && (
              <>
                <span>by {parseResult.meta.author}</span>
                <span className="text-base-content/30">|</span>
              </>
            )}
            <span>v {parseResult.meta.version}</span>
            {parseResult.meta.license && (
              <>
                <span className="text-base-content/30">|</span>
                <span>{parseResult.meta.license}</span>
              </>
            )}
            {parseResult.meta.description && (
              <>
                <span className="hidden lg:inline text-base-content/30">|</span>
                <span className="hidden lg:inline text-sm text-base-content/80 ml-1">
                  {parseResult.meta.description}
                </span>
              </>
            )}
          </div>

          {/* Line 2: Description (mobile only) */}
          {parseResult.meta.description && (
            <div className="lg:hidden text-sm text-base-content/80">
              {parseResult.meta.description}
            </div>
          )}

          {/* Line 3: Domains and URLs */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {parseResult.meta.domains.length > 0 ? (
                parseResult.meta.domains.map((domain) => (
                  <span key={domain} className="badge badge-primary badge-sm">
                    {formatDomainForDisplay(
                      domain,
                      parseResult.css,
                      parseResult.metadataBlock,
                    )}
                  </span>
                ))
              ) : (
                <span className="text-base-content/50">All sites</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {parseResult.meta.homepageURL && (
                <a
                  href={parseResult.meta.homepageURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-bold flex items-center gap-1"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Homepage
                </a>
              )}
              {parseResult.meta.supportURL && (
                <a
                  href={parseResult.meta.supportURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-bold flex items-center gap-2"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Support
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Error from install */}
        {error && (
          <div className="alert alert-error">
            <div>
              <h3 className="font-bold">Installation Error</h3>
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
          <div ref={editorRef} className="absolute inset-0" />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={handleCancel}
            className={`btn btn-ghost ${!document.referrer ? "btn-disabled opacity-50" : ""}`}
            disabled={!document.referrer}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInstall}
            className={`btn btn-primary ${hasErrors ? "btn-disabled" : ""}`}
            disabled={hasErrors || loading}
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-sm mr-2"></span>
                Installing...
              </>
            ) : (
              <>
                <FloppyDisk className="w-4 h-4 mr-2" />
                Add to Eastyles
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SavePage;
