const { Disposable } = require("atom");

// Keeps the providers of one service. `grammarScopes` is read through on every
// call: hub providers expose it as a getter whose value changes as language
// server sessions come and go, so it must never be snapshotted.
module.exports = class ProviderRegistry {
  constructor() {
    this.providers = [];
  }

  addProvider(provider) {
    this.providers.push(provider);
    return new Disposable(() => this.removeProvider(provider));
  }

  removeProvider(provider) {
    const index = this.providers.indexOf(provider);
    if (index !== -1) this.providers.splice(index, 1);
  }

  // All providers claiming the editor's grammar. A missing `grammarScopes`
  // and the `"*"` wildcard both match every editor.
  getAllProvidersForEditor(editor) {
    const scopeName = editor.getGrammar()?.scopeName;
    return this.providers.filter((provider) => {
      const scopes = provider.grammarScopes;
      if (!scopes) return true;
      const list = Array.from(scopes);
      return list.includes("*") || list.includes(scopeName);
    });
  }
};
