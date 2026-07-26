const ListManager = require("./list-manager");

module.exports = {
  activate() {
    this.listManager = new ListManager();
  },

  deactivate() {
    this.listManager?.dispose();
    this.listManager = null;
  },

  consumeListProviders(provider) {
    return this.listManager.listRegistry.addProvider(provider);
  },

  // Highlight providers are registered and kept for forward compatibility;
  // the highlight UI itself is not rendered yet.
  consumeHighlightProviders(provider) {
    return this.listManager.highlightRegistry.addProvider(provider);
  },
};
