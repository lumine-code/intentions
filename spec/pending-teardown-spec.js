describe("Intentions pending request teardown", () => {
  // Analysis fixtures use a real grammar; None deliberately disables this package.
  beforeEach(async () => {
    await lumine.packages.activatePackage("language-text");
  });

  let editor, lease, finish, showing;

  afterEach(async () => {
    finish?.([]);
    await showing;
    lease?.dispose();
    await lumine.packages.deactivatePackage("intentions");
    editor?.destroy();
  });

  it("releases document listeners when the package retires before a provider answers", async () => {
    const main = (await lumine.packages.activatePackage("intentions")).mainModule;
    editor = await lumine.workspace.open();
    const view = editor.getElement();
    const buffer = editor.getBuffer();
    const subscribe = buffer.onDidChangeText.bind(buffer);
    let changes;
    spyOn(buffer, "onDidChangeText").and.callFake((callback) => {
      changes = subscribe(callback);
      spyOn(changes, "dispose").and.callThrough();
      return changes;
    });
    const added = spyOn(view, "addEventListener").and.callThrough();
    const removed = spyOn(view, "removeEventListener").and.callThrough();
    lease = lumine.packages.serviceHub.provide("intentions.list", "1.0.0", {
      getIntentions: () => new Promise((resolve) => (finish = resolve)),
    });
    showing = main.listManager.show(editor);
    const focusListener = added.calls.allArgs().find(([name]) => name === "focusout")[1];

    await lumine.packages.deactivatePackage("intentions");

    expect(changes.dispose).toHaveBeenCalled();
    expect(removed).toHaveBeenCalledWith("focusout", focusListener);
    expect(view.classList.contains("intentions-active")).toBe(false);
    finish([]);
    await showing;
  });
});
