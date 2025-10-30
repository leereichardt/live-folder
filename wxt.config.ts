import { defineConfig } from "wxt";

// NOTE: See https://wxt.dev/api/config.html
export default defineConfig({
  extensionApi: "webextension-polyfill",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    browser_specific_settings: {
      gecko: {
        id: "lf@devsor.us",
      },
    },
    permissions: ["bookmarks", "storage", "alarms", "cookies", "tabs", "tabGroups"],
    host_permissions: ["*://*.github.com/*"],
  },
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
});
