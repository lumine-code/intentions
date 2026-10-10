const { CompositeDisposable, Disposable } = require("lumine");
const ProviderRegistry = require("./provider-registry");
const overlayOwnerKey = Symbol.for("lumine.intentions.overlay-owner");

// Drives the intentions list: an overlay decoration anchored at the cursor
// showing the merged code actions of every matching provider.
module.exports = class ListManager {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.listRegistry = new ProviderRegistry();

    this.overlayDisposables = null;
    this.items = [];
    this.itemOwners = new Map();
    this.selectedIndex = 0;
    this.listElement = null;
    this.showVersion = 0;

    this.subscriptions.add(
      this.listRegistry.onDidRemoveProvider((registration) => {
        if (this.isActive() && [...this.itemOwners.values()].includes(registration)) this.hide();
      }),
      lumine.commands.add("lumine-text-editor:not([mini])", {
        "intentions:show": (event) => this.show(event.currentTarget.getModel()),
      }),
    );
  }

  dispose() {
    this.listRegistry.dispose();
    this.hide();
    this.subscriptions.dispose();
  }

  isActive() {
    return this.overlayDisposables !== null;
  }

  // Gathers the intentions of every provider claiming the editor's grammar
  // and mounts the list at the cursor. Re-invoking while open closes the
  // current list first, so overlays never stack.
  async show(editor) {
    if (this.listRegistry.disposed) return;
    this.hide();
    const version = ++this.showVersion;
    const bufferPosition = editor.getCursorBufferPosition();
    const providers = this.listRegistry.getAllRegistrationsForEditor(editor);
    let bufferChanged = false;
    const changes = editor.getBuffer().onDidChangeText(() => (bufferChanged = true));
    const results = await Promise.all(
      providers.map(async (registration) => {
        if (!this.listRegistry.isRegistered(registration)) return [];
        const { provider } = registration;
        try {
          const result = await provider.getIntentions({ textEditor: editor, bufferPosition });
          return this.listRegistry.isRegistered(registration) ? result || [] : [];
        } catch (error) {
          if (this.listRegistry.isRegistered(registration))
            console.error("[intentions] provider failed", error);
          return [];
        }
      }),
    ).finally(() => changes.dispose());
    // A newer invocation superseded this one while the providers were asked.
    if (version !== this.showVersion || editor.isDestroyed() || bufferChanged) return;
    const owners = new Map();
    const items = results
      .flatMap((items, index) => {
        const registration = providers[index];
        if (!this.listRegistry.isRegistered(registration)) return [];
        for (const item of items) owners.set(item, registration);
        return items;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    if (version !== this.showVersion || editor.isDestroyed()) return;
    if (!items.length) {
      lumine.notifications.addInfo("No intentions available at the cursor position.");
      return;
    }
    this.mount(editor, bufferPosition, items, owners, version);
  }

  mount(editor, bufferPosition, items, owners, version = this.showVersion) {
    const disposables = new CompositeDisposable();
    const view = lumine.views.getView(editor);

    const element = this.render(items, disposables);
    if (this.listRegistry.disposed || version !== this.showVersion || editor.isDestroyed()) {
      disposables.dispose();
      return;
    }
    this.items = items;
    this.itemOwners = owners || new Map();
    this.selectedIndex = 0;
    this.listElement = element;

    const marker = editor.markBufferRange([bufferPosition, bufferPosition], {
      invalidate: "never",
    });
    const decoration = editor.decorateMarker(marker, {
      type: "overlay",
      class: "intentions-overlay",
      position: "tail",
      item: this.listElement,
      // Below the line, and it yields only to the suggestion list. See `side`
      // and `priority` on `decorateMarker`.
      side: "below",
      priority: 1,
    });
    disposables.add(
      new Disposable(() => {
        marker.destroy();
        decoration.destroy();
      }),
    );

    // The keymap routes enter/escape to core:confirm/core:cancel through this
    // class while the list is open.
    const overlayOwner = Symbol();
    view[overlayOwnerKey] = overlayOwner;
    view.classList.add("intentions-active");
    disposables.add(
      new Disposable(() => {
        if (view[overlayOwnerKey] !== overlayOwner) return;
        delete view[overlayOwnerKey];
        view.classList.remove("intentions-active");
      }),
    );

    // Commands registered directly on the editor view run before the editor's
    // own handlers, so the list captures navigation while it is open.
    const guard = (handler) => (event) => {
      if (!this.isActive()) return;
      handler();
      event.stopImmediatePropagation();
    };
    disposables.add(
      lumine.commands.add(view, {
        "core:move-up": guard(() => this.select(this.selectedIndex - 1)),
        "core:move-down": guard(() => this.select(this.selectedIndex + 1)),
        "core:confirm": guard(() => this.confirm(this.selectedIndex)),
        "core:cancel": guard(() => this.hide()),
      }),
    );

    // Scrolling, editing, and leaving the editor all retire the list.
    disposables.add(
      view.onDidChangeScrollTop(() => this.hide()),
      view.onDidChangeScrollLeft(() => this.hide()),
      editor.getBuffer().onDidChangeText(() => this.hide()),
      editor.onDidDestroy(() => this.hide()),
    );
    const onFocusOut = () => this.hide();
    view.addEventListener("focusout", onFocusOut);
    disposables.add(new Disposable(() => view.removeEventListener("focusout", onFocusOut)));

    if (this.listRegistry.disposed || version !== this.showVersion || editor.isDestroyed()) {
      disposables.dispose();
      return;
    }
    this.overlayDisposables = disposables;
  }

  render(items, disposables) {
    const element = document.createElement("div");
    element.classList.add("intentions-list", "select-list", "popover-list");
    // Keep focus (and the overlay) in the editor while clicking the list.
    element.addEventListener("mousedown", (event) => event.preventDefault());

    const list = document.createElement("ol");
    list.classList.add("list-group");
    items.forEach((item, index) => {
      const li = document.createElement("li");
      if (index === 0) li.classList.add("selected");
      if (item.icon) {
        const icon = document.createElement("span");
        disposables.add(
          lumine.icons.applyTo(
            icon,
            { name: item.icon, context: "intentions" },
            { setData: false },
          ),
        );
        li.appendChild(icon);
      }
      const title = document.createElement("span");
      title.classList.add("intentions-title");
      title.textContent = item.title;
      li.appendChild(title);
      li.addEventListener("mousemove", () => this.select(index));
      li.addEventListener("click", () => this.confirm(index));
      list.appendChild(li);
    });
    element.appendChild(list);
    return element;
  }

  select(index) {
    const count = this.items.length;
    if (!count || !this.listElement) return;
    this.selectedIndex = (index + count) % count;
    const rows = this.listElement.querySelectorAll("li");
    rows.forEach((row, i) => row.classList.toggle("selected", i === this.selectedIndex));
    rows[this.selectedIndex].scrollIntoView({ block: "nearest" });
  }

  async confirm(index) {
    const item = this.items[index];
    const owner = this.itemOwners.get(item);
    this.hide();
    if (!item || (owner && !this.listRegistry.isRegistered(owner))) return;
    try {
      await item.selected();
    } catch (error) {
      console.error("[intentions] intention failed", error);
    }
  }

  hide() {
    // Providers can answer after cancellation or package deactivation. Retire
    // their request before removing the overlay, so it cannot be mounted again.
    this.showVersion++;
    this.overlayDisposables?.dispose();
    this.overlayDisposables = null;
    this.items = [];
    this.itemOwners.clear();
    this.selectedIndex = 0;
    this.listElement = null;
  }
};
