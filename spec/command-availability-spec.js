describe("intentions provider availability", () => {
  it("reads grammar metadata without asking providers for actions", async () => {
    const main = (await lumine.packages.activatePackage("intentions")).mainModule;
    const editor = await lumine.workspace.open();
    const manager = main.listManager;
    const query = jasmine.createSpy("discover actions");
    const changed = spyOn(lumine.commands, "invalidateAvailability").and.callThrough();
    const available = () => lumine.commands.canDispatch(editor.getElement(), "intentions:show");
    expect(available()).toBe(false);
    const provider = { grammarScopes: ["source.other"], getIntentions: query };
    const lease = main.consumeIntentionsList(provider);
    expect(available()).toBe(false);
    provider.grammarScopes = [editor.getGrammar().scopeName];
    expect(available()).toBe(true);
    expect(query).not.toHaveBeenCalled();
    lease.dispose();
    expect(available()).toBe(false);
    expect(changed).toHaveBeenCalled();
    expect(manager.items).toEqual([]);
    editor.destroy();
    await lumine.packages.deactivatePackage("intentions");
  });
});
