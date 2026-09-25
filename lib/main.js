const ListManager = require("./list-manager");

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "intentions",
      tips: [
        "You can show the quick fixes available at the cursor with {{ 'intentions:show' | keystroke }}",
      ],
    };
  },

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
