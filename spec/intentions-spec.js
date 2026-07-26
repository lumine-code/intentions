const path = require("path");
const { CompositeDisposable } = require("atom");

const packageRoot = path.join(__dirname, "..");

// Flushes pending microtasks so async provider chains settle without
// advancing the fake clock.
async function microtasks(count = 40) {
  for (let i = 0; i < count; i++) await Promise.resolve();
}

function overlayDecorations(editor) {
  return editor
    .getOverlayDecorations()
    .filter((d) => d.getProperties().class === "intentions-overlay");
}

function overlayItem(editor) {
  return overlayDecorations(editor)[0]?.getProperties().item ?? null;
}

function listTitles(editor) {
  const item = overlayItem(editor);
  return item
    ? Array.from(item.querySelectorAll("li .intentions-title"), (n) => n.textContent)
    : [];
}

function selectedTitle(editor) {
  return overlayItem(editor)?.querySelector("li.selected .intentions-title")?.textContent ?? null;
}

describe("intentions", () => {
  let mainModule;
  let editor;
  let editorView;
  let disposables;

  beforeEach(async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace));
    disposables = new CompositeDisposable();

    const pack = await atom.packages.activatePackage(packageRoot);
    mainModule = pack.mainModule;

    editor = await atom.workspace.open();
    editor.setText("first line\nsecond line\n");
    editor.setCursorBufferPosition([0, 3]);
    editorView = atom.views.getView(editor);
    editorView.focus();
    await microtasks();
  });

  afterEach(async () => {
    disposables.dispose();
    await atom.packages.deactivatePackage("intentions");
    for (const open of atom.workspace.getTextEditors()) open.destroy();
  });

  function addProvider({ grammarScopes = () => ["*"], getIntentions }) {
    const provider = {
      get grammarScopes() {
        return grammarScopes();
      },
      getIntentions,
    };
    disposables.add(mainModule.consumeListProviders(provider));
    return provider;
  }

  it("merges the intentions of all providers, sorted by priority descending", async () => {
    addProvider({
      getIntentions: async () => [
        { title: "Low fix", priority: 10, selected() {} },
        { icon: "zap", title: "High fix", priority: 100, selected() {} },
      ],
    });
    addProvider({
      getIntentions: async () => [{ title: "Middle fix", priority: 50, selected() {} }],
    });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();

    expect(overlayDecorations(editor).length).toBe(1);
    expect(listTitles(editor)).toEqual(["High fix", "Middle fix", "Low fix"]);
    expect(selectedTitle(editor)).toBe("High fix");
    // The icon renders as an octicon span in front of the title.
    const icon = overlayItem(editor).querySelector("li.selected .icon");
    expect(icon.classList.contains("icon-zap")).toBe(true);
    // The keymap scoping class is present while the list is open.
    expect(editorView.classList.contains("intentions-active")).toBe(true);
  });

  it("passes the editor and cursor position to matching providers only", async () => {
    const matching = jasmine.createSpy("getIntentions").and.resolveTo([]);
    const foreign = jasmine.createSpy("getIntentions").and.resolveTo([]);
    addProvider({
      grammarScopes: () => [editor.getGrammar().scopeName],
      getIntentions: matching,
    });
    addProvider({ grammarScopes: () => ["source.some-other"], getIntentions: foreign });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();

    expect(matching).toHaveBeenCalled();
    const [{ textEditor, bufferPosition }] = matching.calls.mostRecent().args;
    expect(textEditor).toBe(editor);
    expect(bufferPosition.isEqual([0, 3])).toBe(true);
    expect(foreign).not.toHaveBeenCalled();
  });

  it("navigates with core:move-down/up and runs the selected intention on core:confirm", async () => {
    const first = jasmine.createSpy("first").and.resolveTo();
    const second = jasmine.createSpy("second").and.resolveTo();
    addProvider({
      getIntentions: async () => [
        { title: "First", priority: 100, selected: first },
        { title: "Second", priority: 50, selected: second },
      ],
    });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();
    expect(selectedTitle(editor)).toBe("First");

    atom.commands.dispatch(editorView, "core:move-down");
    expect(selectedTitle(editor)).toBe("Second");
    atom.commands.dispatch(editorView, "core:move-down");
    expect(selectedTitle(editor)).toBe("First");
    atom.commands.dispatch(editorView, "core:move-up");
    expect(selectedTitle(editor)).toBe("Second");

    atom.commands.dispatch(editorView, "core:confirm");
    await microtasks();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(overlayDecorations(editor).length).toBe(0);
    expect(editorView.classList.contains("intentions-active")).toBe(false);
  });

  it("closes on core:cancel without running any intention", async () => {
    const selected = jasmine.createSpy("selected");
    addProvider({
      getIntentions: async () => [{ title: "Fix", priority: 1, selected }],
    });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();
    expect(overlayDecorations(editor).length).toBe(1);

    // The keymap routes escape to core:cancel while the list is open.
    const bindings = atom.keymaps
      .findKeyBindings({ keystrokes: "escape", target: editorView })
      .map((binding) => binding.command);
    expect(bindings).toContain("core:cancel");

    atom.commands.dispatch(editorView, "core:cancel");
    expect(overlayDecorations(editor).length).toBe(0);
    expect(selected).not.toHaveBeenCalled();
  });

  it("runs an intention on click without moving focus out of the editor", async () => {
    const selected = jasmine.createSpy("selected");
    addProvider({
      getIntentions: async () => [
        { title: "First", priority: 100, selected() {} },
        { title: "Clicked", priority: 50, selected },
      ],
    });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();

    const rows = overlayItem(editor).querySelectorAll("li");
    const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    rows[1].dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).toBe(true);
    rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await microtasks();

    expect(selected).toHaveBeenCalled();
    expect(overlayDecorations(editor).length).toBe(0);
  });

  it("shows no overlay and a notification when no provider has intentions", async () => {
    addProvider({ getIntentions: async () => [] });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();

    expect(overlayDecorations(editor).length).toBe(0);
    expect(editorView.classList.contains("intentions-active")).toBe(false);
    const messages = atom.notifications.getNotifications().map((n) => n.getMessage());
    expect(messages).toContain("No intentions available at the cursor position.");
  });

  it("survives a failing provider and still shows the healthy one", async () => {
    spyOn(console, "error");
    addProvider({ getIntentions: async () => Promise.reject(new Error("boom")) });
    addProvider({
      getIntentions: async () => [{ title: "Healthy", priority: 1, selected() {} }],
    });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();

    expect(listTitles(editor)).toEqual(["Healthy"]);
    expect(console.error).toHaveBeenCalled();
  });

  it("re-invoking while open closes the current list before showing a fresh one", async () => {
    let round = 0;
    addProvider({
      getIntentions: async () => [{ title: `Round ${++round}`, priority: 1, selected() {} }],
    });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();
    expect(listTitles(editor)).toEqual(["Round 1"]);

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();
    expect(overlayDecorations(editor).length).toBe(1);
    expect(listTitles(editor)).toEqual(["Round 2"]);
  });

  it("closes when the buffer is edited", async () => {
    addProvider({
      getIntentions: async () => [{ title: "Fix", priority: 1, selected() {} }],
    });

    atom.commands.dispatch(editorView, "intentions:show");
    await microtasks();
    expect(overlayDecorations(editor).length).toBe(1);

    editor.insertText("x");
    await microtasks();
    expect(overlayDecorations(editor).length).toBe(0);
  });

  it("registers no highlight provider surface", () => {
    expect(mainModule.consumeHighlightProviders).toBeUndefined();
    expect(mainModule.listManager.highlightRegistry).toBeUndefined();
  });
});
