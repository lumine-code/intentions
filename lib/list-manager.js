const { CompositeDisposable, Disposable } = require("atom");
const ProviderRegistry = require("./provider-registry");

// Drives the intentions list: an overlay decoration anchored at the cursor
// showing the merged code actions of every matching provider.
module.exports = class ListManager {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.listRegistry = new ProviderRegistry();
    this.highlightRegistry = new ProviderRegistry();

    this.overlayDisposables = null;
    this.items = [];
    this.selectedIndex = 0;
    this.listElement = null;
    this.showVersion = 0;

    this.subscriptions.add(
      atom.commands.add("atom-text-editor:not([mini])", {
        "intentions:show": (event) => this.show(event.currentTarget.getModel()),
      }),
    );
  }

  dispose() {
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
    this.hide();
    const version = ++this.showVersion;
    const bufferPosition = editor.getCursorBufferPosition();
    const providers = this.listRegistry.getAllProvidersForEditor(editor);
    const results = await Promise.all(
      providers.map(async (provider) => {
        try {
          return (await provider.getIntentions({ textEditor: editor, bufferPosition })) || [];
        } catch (error) {
          console.error("[intentions] provider failed", error);
          return [];
        }
      }),
    );
    // A newer invocation superseded this one while the providers were asked.
    if (version !== this.showVersion) return;
    const items = results.flat().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    if (!items.length) {
      atom.notifications.addInfo("No intentions available at the cursor position.");
      return;
    }
    this.mount(editor, bufferPosition, items);
  }

  mount(editor, bufferPosition, items) {
    const disposables = new CompositeDisposable();
    const view = atom.views.getView(editor);

    this.items = items;
    this.selectedIndex = 0;
    this.listElement = this.render(items);

    const marker = editor.markBufferRange([bufferPosition, bufferPosition], {
      invalidate: "never",
    });
    const decoration = editor.decorateMarker(marker, {
      type: "overlay",
      class: "intentions-overlay",
      position: "tail",
      item: this.listElement,
    });
    disposables.add(
      new Disposable(() => {
        marker.destroy();
        decoration.destroy();
      }),
    );

    // The keymap routes enter/escape to core:confirm/core:cancel through this
    // class while the list is open.
    view.classList.add("intentions-active");
    disposables.add(new Disposable(() => view.classList.remove("intentions-active")));

    // Commands registered directly on the editor view run before the editor's
    // own handlers, so the list captures navigation while it is open.
    const guard = (handler) => (event) => {
      if (!this.isActive()) return;
      handler();
      event.stopImmediatePropagation();
    };
    disposables.add(
      atom.commands.add(view, {
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

    this.overlayDisposables = disposables;
  }

  render(items) {
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
        icon.classList.add("icon", `icon-${item.icon}`);
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
    this.hide();
    if (!item) return;
    try {
      await item.selected();
    } catch (error) {
      console.error("[intentions] intention failed", error);
    }
  }

  hide() {
    this.overlayDisposables?.dispose();
    this.overlayDisposables = null;
    this.items = [];
    this.selectedIndex = 0;
    this.listElement = null;
  }
};
