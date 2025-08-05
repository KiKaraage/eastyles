import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { PluginOption } from "vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["storage", "contextMenus"],
    browser_specific_settings: {
      gecko: {
        id: "eastyles@kikaraage",
      },
    },
    options_ui: {
      page: "/manager.html",
    },
    action: {
      default_title: "Eastyles Popup",
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
    plugins: [tailwindcss() as unknown as PluginOption],
  }),
  imports: {
    eslintrc: {
      enabled: false,
    },
  },
});
