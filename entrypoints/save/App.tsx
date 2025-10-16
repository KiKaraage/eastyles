/**
 * Save Page UI Component
 *
 * Main UI component for the Save UserCSS page
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { css } from "@codemirror/lang-css";

import { browser } from "@wxt-dev/browser";
import { useSaveActions } from "../../hooks/useMessage";
import { useI18n } from "../../hooks/useI18n";
import { FloppyDisk, Settings, NavArrowDown, NavArrowUp, OpenNewWindow } from "iconoir-react";
import { VariableDescriptor } from "../../services/usercss/types";
import { VariableControls } from "../../components/features/VariableControls";

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
      return pattern.substring(0, 22) + "...";
    }
    return pattern || "regexp";
  } catch {
    return pattern.length > 25 ? pattern.substring(0, 22) + "..." : pattern;
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
  const [loading, setLoading] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showVariablesPopover, setShowVariablesPopover] = useState<boolean>(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState<boolean>(false);
  const [showVariablesWide, setShowVariablesWide] = useState<boolean>(true);
  const [showLinksPopover, setShowLinksPopover] = useState<boolean>(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const linksPopoverRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { parseUserCSS, installStyle } = useSaveActions();
  const { t } = useI18n();

  // Handle variable change
  const handleVariableChange = useCallback((name: string, value: string) => {
    setVariableValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Initialize variable values from parseResult
  useEffect(() => {
    if (parseResult?.variables) {
      const initialValues: Record<string, string> = {};
      Object.values(parseResult.variables).forEach((variable) => {
        initialValues[variable.name] = variable.value || variable.default;
      });
      setVariableValues(initialValues);
    }
  }, [parseResult]);

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setShowVariablesPopover(false);
      }
      if (linksPopoverRef.current && !linksPopoverRef.current.contains(event.target as Node)) {
        setShowLinksPopover(false);
      }
    };

    if (showVariablesPopover || showLinksPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showVariablesPopover, showLinksPopover]);

  const handleInstall = useCallback(
    async (result: ParseResult) => {
      try {
        setInstalling(true); // Show installing state during installation

        // Extract variables from the parsed result with current values
        const variables = result.variables
          ? Object.values(result.variables).map((variable) => ({
              name: variable.name,
              type: variable.type,
              default: variableValues[variable.name] || variable.default,
              min: variable.min,
              max: variable.max,
              options: variable.options,
            }))
          : [];

        const response = await installStyle(result.meta, result.css, variables);

        // Clear any revious errors and show success toast
        if (response.success) {
          setError(null);
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
                <div class="text-xs">Style installed successfully!</div>
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
            if (canGoBack && typeof window !== "undefined" && window.history) {
              window.history.back();
            } else if (typeof window !== "undefined" && window.close) {
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
      } catch (error) {
        console.error("Installation error:", error);
        setError(
          error instanceof Error ? error.message : "Unknown installation error",
        );
      } finally {
        setInstalling(false);
      }
    },
    [installStyle, canGoBack, variableValues],
  );

  // Initialize CodeMirror editor
  useEffect(() => {
    if (parseResult && editorRef.current && !editorViewRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (editorRef.current && !editorViewRef.current) {
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
                EditorView.lineWrapping, // Enable line wrapping
                EditorView.theme({
                  "&": {
                    height: "100%",
                    minHeight: "400px",
                    fontSize: "12px",
                  },
                  ".cm-scroller": {
                    overflow: "auto",
                  },
                  ".cm-content": {
                    fontFamily: "monospace",
                  },
                }),
              ],
              parent: editorRef.current,
            });
            console.log("CodeMirror initialized successfully");
          } catch (error) {
            // In test environment, EditorView might not be available
            console.warn(
              "EditorView not available in test environment:",
              error,
            );
          }
        }
      });
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
          // No content or URL provided, use fallback CSS
          cssText = `/* ==UserStyle==
@name Example Style
@namespace example.com
@version 1.0.0
@description An example UserCSS style for demonstration
@author Example Author
@homepageURL https://example.com/style.user.css
==/UserStyle== */

@-moz-document domain("example.com") {
  body {
    background-color: #ffffff !important;
  }
}`;
          sourceUrl = "https://example.com/style.user.css";
          console.log("Using fallback CSS, length:", cssText.length);
        }

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
          "css" in parseResponse
        ) {
          setParseResult({
            meta: {
              name: parseResponse.meta.name,
              namespace: parseResponse.meta.namespace || "",
              version: parseResponse.meta.version,
              description: parseResponse.meta.description,
              author: parseResponse.meta.author,
              sourceUrl: parseResponse.meta.sourceUrl,
               homepageURL: (parseResponse.meta as StyleMetadata).homepageURL,
               supportURL: (parseResponse.meta as StyleMetadata).supportURL,
               license: (parseResponse.meta as StyleMetadata).license,
               domains: parseResponse.meta.domains || [],
               variables: (parseResponse.meta as StyleMetadata).variables,
            },
            css: parseResponse.css || "",
            metadataBlock: parseResponse.metadataBlock,
            variables:
              (
                parseResponse as {
                  variables?: Record<string, VariableDescriptor>;
                }
              ).variables || {},
            warnings: parseResponse.warnings || [],
            errors: parseResponse.errors || [],
          });
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
    if (typeof document !== "undefined" && document.referrer) {
      setCanGoBack(true);
    } else {
      setCanGoBack(false);
    }

    loadUserCSS();
  }, [parseUserCSS]);

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
  const hasVariables = parseResult.variables && Object.keys(parseResult.variables).length > 0;
  const variablesForUI = hasVariables
    ? Object.values(parseResult.variables || {}).map((v) => ({
        ...v,
        value:
          (variableValues && variableValues[v.name] !== undefined)
            ? variableValues[v.name]
            : (v.value || v.default),
      }))
    : [];

  // Extract links for the link button
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const source = urlParams?.get('source');
  const userCssUrl = urlParams?.get('url');

  // Build links array from metadata and context
  const links: Array<{url: string, label: string}> = [];

  // Add homepage and support URLs from metadata if present
  const homepageURL = parseResult.meta.homepageURL || parseResult.meta.sourceUrl;
  const supportURL = parseResult.meta.supportURL as string | undefined;
  if (homepageURL && homepageURL.trim()) {
    links.push({ url: homepageURL, label: 'Homepage' });
  }
  if (supportURL && supportURL.trim()) {
    links.push({ url: supportURL, label: 'Support' });
  }

  // Add source website origin for external URLs
  if (userCssUrl && source === 'external') {
    try {
      const originUrl = new URL(userCssUrl).origin;
      if (!links.some((l) => l.url === originUrl)) {
        links.push({ url: originUrl, label: 'Source Website' });
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Deduplicate links by URL
  const uniqueLinks = links.filter((l, idx, arr) => arr.findIndex((x) => x.url === l.url) === idx);
  const showLinkButton = uniqueLinks.length > 0;

  return (
<div className="h-screen w-screen bg-base-100 p-4 overflow-hidden">
      <div className="flex flex-col lg:flex-row h-full gap-4">
        {/* Code Preview - Left side (desktop) or bottom (narrow) */}
<div className="w-full lg:w-[70vw] order-2 lg:order-1 flex-1 min-h-[40vh] lg:min-h-0 lg:max-h-full lg:flex-none">
          <div className="bg-base-300 rounded-lg overflow-hidden h-full">
            <div ref={editorRef} className="h-full" />
          </div>
        </div>

        {/* Metadata Panel - Right side (desktop) or top (narrow) */}
        <div className="w-full lg:max-w-[calc(30%-3rem)] order-1 lg:order-2 flex-shrink-0 lg:h-full flex flex-col">
            <div className="bg-base-100 border-0 flex flex-col lg:h-full relative">
            {/* Header - Sticky on wide screens */}
            <div className="p-4 lg:sticky lg:top-0 lg:bg-base-100 lg:z-10">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="h-8 w-8 bg-current text-primary flex-shrink-0"
                    style={{
                      WebkitMask: "url(/logo.svg) no-repeat center",
                      WebkitMaskSize: "contain",
                      mask: "url(/logo.svg) no-repeat center",
                      maskSize: "contain",
                    }}
                    aria-hidden="true"
                  />
                   <div className="min-w-0">
                     <h1 
                       className="card-title text-xl font-bold truncate lg:whitespace-nowrap lg:overflow-hidden lg:text-ellipsis"
                       title={parseResult.meta.name}
                     >
                       {parseResult.meta.name}
                     </h1>
              </div>

              {/* Footer - At bottom on wide screens, hidden on narrow */}
              <div className="hidden lg:flex p-4 pt-0 justify-between sticky bottom-0 bg-base-100 z-10">
                {showLinkButton ? (
                  <div className="relative" ref={linksPopoverRef}>
                    <button
                      type="button"
                      onClick={() => setShowLinksPopover(!showLinksPopover)}
                      className="btn btn-ghost btn-sm"
                      title="Open links"
                    >
                      <OpenNewWindow className="w-4 h-4" />
                    </button>
                    {showLinksPopover && (
                      <div className="absolute left-0 bottom-full mb-1 w-56 bg-base-200 rounded-lg shadow-xl border border-base-300 py-2 z-50">
                        {uniqueLinks.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-2 hover:bg-base-300 text-sm"
                          onClick={() => setShowLinksPopover(false)}
                        >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  onClick={() => parseResult && handleInstall(parseResult)}
                  className={`btn btn-primary ${hasErrors || installing ? "btn-disabled loading" : ""}`}
                  disabled={hasErrors || installing || !parseResult}
                >
                  <FloppyDisk className="w-4 h-4 mr-2" />
                  {installing ? "Installing..." : "Save to Eastyles"}
                </button>
              </div>
            </div>
                <div className="block lg:hidden flex-shrink-0 flex gap-2 relative">
                  {hasVariables && (
                    <div className="relative" ref={popoverRef}>
                      <button
                        type="button"
                        onClick={() => setShowVariablesPopover(!showVariablesPopover)}
                        className="btn btn-ghost btn-sm"
                        title="Configure variables"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      {showVariablesPopover && (
                        <div className="absolute left-2 right-2 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-base-200 rounded-lg shadow-xl border border-base-300 p-4 z-50 max-h-[60vh] overflow-auto">
                          <VariableControls
                            variables={variablesForUI}
                            onChange={handleVariableChange}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => parseResult && handleInstall(parseResult)}
className={`btn btn-primary btn-sm ${hasErrors || installing ? "btn-disabled loading" : ""}`}
                    disabled={hasErrors || installing || !parseResult}
                  >
                    <FloppyDisk className="w-4 h-4 mr-1" />
{installing ? "Installing..." : "Save to Eastyles"}
                  </button>
                </div>
              </div>
            </div>

            {/* Body - Scrollable on wide screens */}
             <div className="p-4 pt-1 lg:flex lg:flex-col relative">
              {/* Gradient masks (sticky) on wide screens */}


                 <div className="space-y-4">
                {/* Sticky metadata + variable header on wide screens */}
                <div className="lg:sticky lg:top-0 lg:bg-base-100 lg:z-10">
                  <div>
                    <p className="text-sm text-base-content/70">
                      {parseResult.meta.author && `by ${parseResult.meta.author}`}
                      {parseResult.meta.author &&
                        parseResult.meta.version &&
                        " | "}
                      {parseResult.meta.version &&
                        `v ${parseResult.meta.version}`}
                      {(parseResult.meta.author || parseResult.meta.version) &&
                        parseResult.meta.license &&
                        " | "}
                      {parseResult.meta.license && `${parseResult.meta.license}`}
                    </p>
                    <p className="text-sm mt-1">{parseResult.meta.description}</p>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 min-w-0 lg:flex lg:flex-wrap lg:gap-1">
                    {/* Wide screen: wrap badges */}
                    <div className="hidden lg:flex lg:flex-wrap lg:gap-1">
                      {parseResult.meta.domains.length > 0 ? (
                        parseResult.meta.domains.map((domain) => (
                          <span
                            key={`domain-${domain}`}
                            className="badge badge-primary badge-sm"
                          >
                            {formatDomainForDisplay(
                              domain,
                              parseResult.css,
                              parseResult.metadataBlock,
                            )}
                          </span>
                        ))
                      ) : (
                        <span className="text-base-content/50 text-sm">
                          No specific domains
                        </span>
                      )}
                    </div>
                    {/* Narrow screen: horizontal scroll with gradient mask */}
                    <div className="lg:hidden relative">
                      <div className="flex gap-1 overflow-x-auto scrollbar-hide" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
                        {parseResult.meta.domains.length > 0 ? (
                          parseResult.meta.domains.map((domain) => (
                            <span
                              key={`domain-${domain}`}
                              className="badge badge-primary badge-sm whitespace-nowrap flex-shrink-0"
                            >
                              {formatDomainForDisplay(
                                domain,
                                parseResult.css,
                                parseResult.metadataBlock,
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="text-base-content/50 text-sm">
                            No specific domains
                          </span>
                        )}
                      </div>
                      {parseResult.meta.domains.length > 1 && (
                        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-base-100 to-transparent pointer-events-none" />
                      )}
                    </div>
                  </div>
                  {showLinkButton && (
                    <div className="lg:hidden relative" ref={linksPopoverRef}>
                      <button
                        type="button"
                        onClick={() => setShowLinksPopover(!showLinksPopover)}
                        className="btn btn-ghost btn-xs flex-shrink-0"
                        title="Open links"
                      >
                        <OpenNewWindow className="w-4 h-4" />
                      </button>
                    {showLinksPopover && (
                        <div className="absolute left-2 right-2 top-full mt-1 bg-base-200 rounded-lg shadow-xl border border-base-300 py-2 z-50">
                          {uniqueLinks.map((link, idx) => (
                            <a
                              key={idx}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block px-4 py-2 hover:bg-base-300 text-sm"
                              onClick={() => window.open(link.url, '_blank')}
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Wide-only Variable Controls header (sticky within content) */}
                {hasVariables && (
                  <div className="hidden lg:block mt-4">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between mb-2 btn btn-ghost p-2 h-auto"
                      onClick={() => setShowVariablesWide((v) => !v)}
                      title={showVariablesWide ? "Hide variables" : "Show variables"}
                    >
                      <h3 className="text-lg font-semibold m-0">Variable Configuration</h3>
                      {showVariablesWide ? (
                        <NavArrowUp className="w-4 h-4" />
                      ) : (
                        <NavArrowDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="alert alert-warning mt-4">
                  <h4 className="font-semibold">{t("warning")}</h4>
                  <ul className="list-disc pl-5 mt-1 text-sm">
                    {parseResult.warnings.map((warning) => (
                      <li key={`warning-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {hasErrors && (
                <div className="alert alert-error mt-2">
                  <h4 className="font-semibold">Errors</h4>
                  <ul className="list-disc pl-5 mt-1 text-sm">
                    {parseResult.errors.map((error) => (
                      <li key={`error-${error}`}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {error && (
                <div className="alert alert-error mt-2">
                  <h4 className="font-semibold">Installation Error</h4>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {/* Variable Controls - Only on wide screens */}
              {hasVariables && showVariablesWide && (
                 <div className="hidden lg:block mt-2 lg:overflow-auto lg:max-h-[calc(100vh-10rem)]">
                  <VariableControls
                    showTitle={false}
                    variables={variablesForUI}
                    onChange={handleVariableChange}
                  />
                </div>
              )}

            </div>


                    )}
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  onClick={() => parseResult && handleInstall(parseResult)}
                  className={`btn btn-primary ${hasErrors || installing ? "btn-disabled loading" : ""}`}
                  disabled={hasErrors || installing || !parseResult}
                >
                  <FloppyDisk className="w-4 h-4 mr-2" />
                  {installing ? "Installing..." : "Save to Eastyles"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
     </div>
     </div>
   );
};

export default SavePage;
