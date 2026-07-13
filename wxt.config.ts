import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "output",
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  autoIcons: {
    baseIconPath: "assets/icon.svg",
    developmentIndicator: false,
  },
  manifest: ({ browser }) => ({
    name: "Folio",
    short_name: "Folio",
    description: "Capture thoughts, selections, and pages without leaving your flow.",
    version: "0.1.0",
    permissions:
      browser === "firefox"
        ? ["activeTab", "storage", "tabs"]
        : ["activeTab", "scripting", "sidePanel", "storage", "tabs"],
    action: {
      default_title: "Open Folio",
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Ctrl+Shift+Y",
          mac: "Command+Shift+Y",
        },
        description: "Open Folio",
      },
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              data_collection_permissions: { required: ["none"] },
            },
          },
        }
      : {}),
  }),
});
