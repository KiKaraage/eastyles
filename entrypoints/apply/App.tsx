/**
 * Apply Page UI Component
 *
 * Main UI component for the Apply UserCSS page
 */

import React, { useState, useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { css } from "@codemirror/lang-css";
import { useApplyActions } from "../../hooks/useMessage";

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

const ApplyPage: React.FC = () => {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [canGoBack, setCanGoBack] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const { parseUserCSS, installStyle } = useApplyActions();

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
         console.warn('EditorView not available in test environment:', error);
       }
     }

     return () => {
       if (editorViewRef.current && typeof editorViewRef.current.destroy === 'function') {
         editorViewRef.current.destroy();
         editorViewRef.current = null;
       }
     };
   }, [parseResult]);

  // Update editor content when parseResult changes
   useEffect(() => {
     if (editorViewRef.current && parseResult && editorViewRef.current.state?.doc) {
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
        // Get CSS content from URL parameters or fallback to mock data
        const urlParams = new URLSearchParams(window.location.search);
        const cssText = urlParams.get("css") || getMockUserCSSText();
        const sourceUrl = urlParams.get("sourceUrl") || undefined;

        // Parse the UserCSS
        const response = await parseUserCSS(cssText, sourceUrl);

        if (response.success && response.meta && response.css) {
          setParseResult({
            meta: {
              ...response.meta,
              domains: response.meta.domains || [],
            },
            css: response.css,
            warnings: response.warnings || [],
            errors: response.errors || [],
          });
        } else {
          setError(response.error || "Failed to parse UserCSS");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    // Check if we can go back (document.referrer exists)
    setCanGoBack(!!document.referrer);

    loadUserCSS();
  }, [parseUserCSS]);

  // Mock UserCSS text for demonstration
  const getMockUserCSSText = () => `/* ==UserStyle==
@name         Example Style
@namespace    example.com
@version      1.0.0
@description  An example UserCSS style for demonstration
@author       Example Author
@homepageURL  https://example.com/style.user.css
==/UserStyle== */

body {
  background-color: /*[[--bg-color|color|#ffffff]]*/ #ffffff;
  color: /*[[--text-color|color|#000000]]*/ #000000;
}`;

  const handleInstall = async () => {
    if (!parseResult) return;

    try {
      const response = await installStyle(
        parseResult.meta,
        parseResult.css,
        [], // TODO: Extract variables from CSS
      );

      if (response.success) {
        // Show success message
        setError(null); // Clear any previous errors

        // Show success toast (you can replace this with a proper toast library)
        const successToast = document.createElement("div");
        successToast.className = "toast toast-top toast-end";
        successToast.innerHTML = `
          <div class="alert alert-success">
            <span>Style installed successfully!</span>
          </div>
        `;
        document.body.appendChild(successToast);

        // Remove toast after 3 seconds
        setTimeout(() => {
          if (successToast.parentNode) {
            successToast.parentNode.removeChild(successToast);
          }
        }, 3000);

        // Close the window or go back after a short delay
        setTimeout(() => {
          if (canGoBack) {
            window.history.back();
          } else {
            window.close();
          }
        }, 1000);
      } else {
        setError(response.error || "Failed to install style");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install style");
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
    <div className="min-h-screen bg-base-100 p-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Apply UserCSS</h1>
          <p className="text-base-content/70">
            Preview and install UserCSS styles
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Metadata Panel */}
          <div className="card bg-base-200 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Style Information</h2>

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
          <div className="card bg-base-200 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Code Preview</h2>
              <div className="bg-base-300 rounded-lg overflow-hidden">
                <div ref={editorRef} className="min-h-[400px]" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mt-8">
          <button
            onClick={handleCancel}
            className={`btn ${!canGoBack ? "btn-disabled opacity-50" : "btn-ghost"}`}
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            className={`btn btn-primary ${hasErrors ? "btn-disabled" : ""}`}
            disabled={hasErrors}
          >
            Add to Eastyles
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApplyPage;
