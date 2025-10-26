/**
 * Edit Page Entry Point
 *
 * Main entry point for the Edit UserCSS page
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Create root container
if (typeof document !== "undefined" && document.getElementById) {
  const container = document.getElementById("root");
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}
