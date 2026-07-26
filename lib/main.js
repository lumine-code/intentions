const ListManager = require("./list-manager");

module.exports = {
  activate() {
    this.listManager = new ListManager();
  },

  deactivate() {
    this.listManager?.dispose();
    this.listManager = null;
  },

  consumeIntentionsList(provider) {
    return this.listManager.listRegistry.addProvider(provider);
  },
};
