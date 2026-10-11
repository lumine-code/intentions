beforeEach(() => {
  for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
    spyOn(lumine.shell, method).and.resolveTo();
  spyOn(lumine.application, "openWindow").and.resolveTo();
});

describe("Intentions awaiting a provider when focus leaves the editor", () => {
  let editor, other, main, lease, finish, request, asked;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    if (lumine.packages.isPackageLoaded("intentions"))
      await lumine.packages.unloadPackage("intentions");
    main = (await lumine.packages.activatePackage("intentions")).mainModule;
    editor = await lumine.workspace.open();
    editor.setText("owned text");
    editor.setCursorBufferPosition([0, 5]);
    other = await lumine.workspace.open(undefined, { split: "right" });
    const pane = lumine.workspace.paneForItem(editor);
    pane.activate();
    pane.activateItem(editor);
    editor.getElement().focus();
    asked = false;
    const answer = new Promise((resolve) => (finish = resolve));
    lease = lumine.packages.serviceHub.provide("intentions.list", "1.0.0", {
      getIntentions({ textEditor }) {
        expect(textEditor).toBe(editor);
        asked = true;
        return answer;
      },
    });
    spyOn(main.listManager, "show").and.callThrough();
  });

  afterEach(async () => {
    finish?.([]);
    await request;
    lease?.dispose();
    if (lumine.packages.isPackageLoaded("intentions"))
      await lumine.packages.unloadPackage("intentions");
    editor?.destroy();
    other?.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
    editor = other = main = lease = finish = request = null;
  });

  function show() {
    lumine.commands.dispatch(editor.getElement(), "intentions:show");
    request = main.listManager.show.calls.mostRecent().returnValue;
    expect(asked).toBe(true);
  }
  const overlays = () =>
    editor
      .getOverlayDecorations()
      .filter((decoration) => decoration.getProperties().class === "intentions-overlay");

  it("does not reopen an old overlay after focus moves to another editor", async () => {
    show();
    const pane = lumine.workspace.paneForItem(other);
    pane.activate();
    pane.activateItem(other);
    other.getElement().focus();
    expect(other.getElement().contains(document.activeElement)).toBe(true);
    expect(editor.getElement().contains(document.activeElement)).toBe(false);
    finish([{ title: "Old focus action", selected() {} }]);
    await request;
    expect(overlays().length).toBe(0);
    expect(editor.getElement().classList.contains("intentions-active")).toBe(false);
  });

  it("shows and executes the action while the editor keeps focus", async () => {
    show();
    finish([{ title: "Current action", selected: () => editor.insertText(" FIX") }]);
    await request;
    expect(overlays().length).toBe(1);
    await lumine.commands.dispatch(editor.getElement(), "core:confirm");
    expect(editor.getText()).toBe("owned FIX text");
    expect(overlays().length).toBe(0);
  });
});
