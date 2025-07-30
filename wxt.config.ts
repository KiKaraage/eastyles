import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { PluginOption } from "vite";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["storage"],
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
