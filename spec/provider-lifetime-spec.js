describe("Intentions service provider ownership", () => {
  let main, editor, leases;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    main = (await lumine.packages.activatePackage("intentions")).mainModule;
    editor = await lumine.workspace.open();
    editor.setText("controlled intentions");
    leases = [];
  });
  afterEach(async () => {
    for (const lease of leases) lease.dispose();
    await lumine.packages.deactivatePackage("intentions");
    editor.destroy();
  });
  function provide(payload) {
    const lease = lumine.packages.serviceHub.provide("intentions.list", "1.0.0", payload);
    leases.push(lease);
    return lease;
  }
  const action = (title) => ({ title, selected() {} });
  function titles() {
    return main.listManager.items.map((item) => item.title);
  }
  it("queries a shared payload once while any real hub registration remains", async () => {
    const provider = {
      getIntentions: jasmine.createSpy("get intentions").and.resolveTo([action("Shared")]),
    };
    const first = provide(provider),
      second = provide(provider);
    await main.listManager.show(editor);
    expect(provider.getIntentions).toHaveBeenCalledTimes(1);
    expect(titles()).toEqual(["Shared"]);
    first.dispose();
    provider.getIntentions.calls.reset();
    await main.listManager.show(editor);
    expect(provider.getIntentions).toHaveBeenCalledTimes(1);
    expect(titles()).toEqual(["Shared"]);
    second.dispose();
    await main.listManager.show(editor);
    expect(titles()).toEqual([]);
  });
  it("drops a withdrawn provider's pending actions while retaining another live provider", async () => {
    let finish;
    const obsolete = provide({
      getIntentions: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    provide({ getIntentions: () => [action("Current")] });
    const showing = main.listManager.show(editor);
    obsolete.dispose();
    finish([action("Obsolete")]);
    await showing;
    expect(titles()).toEqual(["Current"]);
  });
  it("drops a provider withdrawn after its answer while another provider is still pending", async () => {
    let finish;
    const obsolete = provide({ getIntentions: () => [action("Obsolete")] });
    provide({
      getIntentions: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const showing = main.listManager.show(editor);
    await Promise.resolve();
    await Promise.resolve();
    obsolete.dispose();
    finish([action("Current")]);
    await showing;
    expect(titles()).toEqual(["Current"]);
  });
  it("does not log a retired provider error and still reports current failures", async () => {
    const log = spyOn(console, "error");
    let reject;
    const obsolete = provide({
      getIntentions: () =>
        new Promise((resolve, fail) => {
          reject = fail;
        }),
    });
    const showing = main.listManager.show(editor);
    obsolete.dispose();
    reject(new Error("Obsolete provider"));
    await showing;
    expect(log).not.toHaveBeenCalled();
    provide({
      getIntentions() {
        throw new Error("Current provider");
      },
    });
    await main.listManager.show(editor);
    expect(log).toHaveBeenCalledTimes(1);
  });
  it("does not run a displayed action after its final hub edge is withdrawn", async () => {
    const selected = jasmine.createSpy("obsolete selected");
    const lease = provide({ getIntentions: () => [{ title: "Obsolete", selected }] });
    await main.listManager.show(editor);
    lease.dispose();
    await main.listManager.confirm(0);
    expect(selected).not.toHaveBeenCalled();
  });
  it("releases a staged icon and does not mount after opaque icon rendering retires the package", async () => {
    const manager = main.listManager;
    const apply = lumine.icons.applyTo.bind(lumine.icons);
    let iconLease;
    spyOn(lumine.icons, "applyTo").and.callFake((...args) => {
      iconLease = apply(...args);
      spyOn(iconLease, "dispose").and.callThrough();
      main.deactivate();
      return iconLease;
    });
    provide({ getIntentions: () => [{ title: "Retired", icon: "zap", selected() {} }] });
    await manager.show(editor);
    expect(iconLease.dispose).toHaveBeenCalledTimes(1);
    expect(
      editor
        .getOverlayDecorations()
        .filter((decoration) => decoration.getProperties().class === "intentions-overlay"),
    ).toEqual([]);
    expect(editor.element.classList.contains("intentions-active")).toBe(false);
  });
});
