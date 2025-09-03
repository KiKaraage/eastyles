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
    permissions: ["storage", "contextMenus"],
    default_locale: "en",
    browser_specific_settings: {
      gecko: {
        id: "eastyles@kikaraage",
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
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@services": path.resolve(__dirname, "./services"),
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
