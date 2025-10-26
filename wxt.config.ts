import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: [
    "@wxt-dev/module-react",
    "@wxt-dev/webextension-polyfill",
    "@wxt-dev/i18n/module",
  ],
  manifest: {
    name: "__MSG_appName__",
    description: "__MSG_appDescription__",
    permissions: ["storage", "contextMenus", "tabs"],
    default_locale: "en",
    browser_specific_settings: {
      gecko: {
        id: "eastyles@kikaraage",
      },
    },
    commands: {
      "open-manager": {
        description: "__MSG_manageStyles__",
      },
    },
    options_ui: {
      page: "/manager.html",
    },
    action: {
      default_title: "__MSG_appName__",
      default_popup: "popup.html",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "128": "icon/128.png",
      },
    },
    web_accessible_resources: [
      {
        resources: ["fonts/*"],
        matches: ["<all_urls>"],
      },
      {
        resources: ["*.user.css"],
        matches: ["<all_urls>"],
      },
      {
        resources: ["save.html"],
        matches: ["<all_urls>"],
      },
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@services": path.resolve(__dirname, "./services"),
      },
    },
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          // Suppress various warnings including daisyUI @property warnings
          const message =
            "message" in warning ? (warning.message as string) || "" : "";
          const warningString = typeof warning === "string" ? warning : "";

          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            message.includes(
              "has been externalized for browser compatibility",
            ) ||
            message.includes("Unknown at rule") ||
            message.includes("@property") ||
            message.includes("radialprogress") ||
            ("loc" in warning &&
              warning.loc?.file?.includes(".css") &&
              message.includes("Unknown at rule")) ||
            // Also suppress plugin-related warnings that might not have specific codes
            warningString.includes("@property") ||
            ("plugin" in warning &&
              warning.plugin?.includes("css") &&
              message.includes("Unknown")) ||
            // Suppress Vite CSS optimization warnings
            (message.includes("optimizing generated CSS") &&
              message.includes("Unknown")) ||
            (message.includes("Found") &&
              message.includes("warning") &&
              message.includes("optimizing"))
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
    logLevel: "warn",
    css: {
      preprocessorOptions: {
        stylus: {
          // Stylus options can be configured here if needed
        },
      },
      devSourcemap: false,
    },
  }),
  imports: {
    eslintrc: {
      enabled: false,
    },
  },
  alias: {
    "@services": path.resolve(__dirname, "./services"),
  },
});
