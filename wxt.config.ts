import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "output",
  modules: ["@wxt-dev/module-react", "@wxt-dev/auto-icons"],
  autoIcons: {
    baseIconPath: "assets/icon.svg",
    developmentIndicator: false,
  },
  manifest: ({ browser }) => ({
    default_locale: "en",
    name: "__MSG_extensionName__",
    short_name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    version: "0.4.1",
    host_permissions: ["https://folio.warmbeing.com/*"],
    permissions:
      browser === "firefox"
        ? ["activeTab", "storage"]
        : ["activeTab", "scripting", "sidePanel", "storage"],
    action: {
      default_title: "__MSG_openFolio__",
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Ctrl+Shift+Y",
          mac: "Command+Shift+Y",
        },
        description: "__MSG_openFolio__",
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
