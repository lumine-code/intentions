describe("Intentions awaiting a provider while the buffer changes", () => {
  let editor, main, lease, finish, requested, request;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.resolveTo();
    spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("intentions")).mainModule;
    editor = await lumine.workspace.open();
    editor.setText("original text");
    editor.setCursorBufferPosition([0, 3]);
    editor.getElement().focus();
    requested = false;
    const answer = new Promise((resolve) => (finish = resolve));
    lease = lumine.packages.serviceHub.provide("intentions.list", "1.0.0", {
      getIntentions({ textEditor }) {
        expect(textEditor).toBe(editor);
        requested = true;
        return answer;
      },
    });
    spyOn(main.listManager, "show").and.callThrough();
  });

  afterEach(async () => {
    finish?.([]);
    await request;
    lease?.dispose();
    editor?.destroy();
    if (lumine.packages.isPackageActive("intentions"))
      await lumine.packages.deactivatePackage("intentions");
    if (lumine.packages.isPackageLoaded("intentions"))
      await lumine.packages.unloadPackage("intentions");
    await lumine.fileWatchClient.settlePendingTeardown();
    editor = main = lease = finish = request = null;
  });

  function show() {
    lumine.commands.dispatch(editor.getElement(), "intentions:show");
    request = main.listManager.show.calls.mostRecent().returnValue;
    expect(requested).toBe(true);
  }

  function overlays() {
    return editor
      .getOverlayDecorations()
      .filter((decoration) => decoration.getProperties().class === "intentions-overlay");
  }

  it("discards an action requested for text edited before the provider answers", async () => {
    show();
    editor.insertText(" changed");
    expect(editor.getText()).toBe("ori changedginal text");
    finish([{ title: "Old text action", selected() {} }]);
    await request;
    expect(overlays().length).toBe(0);
    expect(editor.getElement().classList.contains("intentions-active")).toBe(false);
  });

  it("shows and executes the action while the requested buffer stays unchanged", async () => {
    const selected = jasmine.createSpy("selected");
    show();
    finish([{ title: "Current text action", selected }]);
    await request;
    expect(overlays().length).toBe(1);
    expect(overlays()[0].getProperties().item.textContent).toContain("Current text action");
    lumine.commands.dispatch(editor.getElement(), "core:confirm");
    expect(selected).toHaveBeenCalledTimes(1);
    expect(overlays().length).toBe(0);
  });
});
