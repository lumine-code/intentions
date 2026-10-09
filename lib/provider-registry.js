const { Disposable, Emitter } = require("lumine");

// Keeps the providers of one service. `grammarScopes` is read through on every
// call: hub providers expose it as a getter whose value changes as language
// server sessions come and go, so it must never be snapshotted.
module.exports = class ProviderRegistry {
  constructor() {
    this.registrations = new Map();
    this.disposed = false;
    this.emitter = new Emitter();
  }

  addProvider(provider) {
    if (this.disposed) return new Disposable();
    let registration = this.registrations.get(provider);
    if (!registration) {
      registration = { provider, references: 0 };
      this.registrations.set(provider, registration);
    }
    registration.references++;
    return new Disposable(() => {
      if (!this.isRegistered(registration)) return;
      if (--registration.references === 0) {
        this.registrations.delete(provider);
        this.emitter.emit("did-remove", registration);
      }
    });
  }

  isRegistered(registration) {
    return !this.disposed && this.registrations.get(registration.provider) === registration;
  }

  dispose() {
    this.disposed = true;
    this.registrations.clear();
    this.emitter.dispose();
  }

  onDidRemoveProvider(callback) {
    return this.emitter.on("did-remove", callback);
  }

  // All providers claiming the editor's grammar. A missing `grammarScopes`
  // and the `"*"` wildcard both match every editor.
  getAllProvidersForEditor(editor) {
    return this.getAllRegistrationsForEditor(editor).map(({ provider }) => provider);
  }

  getAllRegistrationsForEditor(editor) {
    const scopeName = editor.getGrammar()?.scopeName;
    return [...this.registrations.values()].filter((registration) => {
      if (!this.isRegistered(registration)) return false;
      const { provider } = registration;
      const scopes = provider.grammarScopes;
      if (!this.isRegistered(registration)) return false;
      if (!scopes) return true;
      const list = Array.from(scopes);
      return list.includes("*") || list.includes(scopeName);
    });
  }
};
