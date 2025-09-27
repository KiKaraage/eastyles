import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: [
    "@wxt-dev/module-react",
    "@wxt-dev/webextension-polyfill",
    "@wxt-dev/i18n/module",
  ],
  i18n: {
    localesDir: "public/_locales",
  },
  manifest: {
    permissions: ["storage", "contextMenus", "tabs"],
    default_locale: "en",
    browser_specific_settings: {
      gecko: {
        id: "eastyles@kikaraage",
      },
    },
    commands: {
      "open-manager": {
        "description": "Open style manager",
      },
    },
    options_ui: {
      page: "/manager.html",
    },
    action: {
      default_title: "Apply styles to this site",
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
          // Suppress Stylus-related externalization warnings
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" ||
            (warning.message &&
              warning.message.includes(
                "has been externalized for browser compatibility",
              ))
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
    css: {
      preprocessorOptions: {
        stylus: {
          // Stylus options can be configured here if needed
        },
      },
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
