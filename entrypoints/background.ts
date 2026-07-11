export default defineBackground(() => {
  if (import.meta.env.CHROME) {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});
