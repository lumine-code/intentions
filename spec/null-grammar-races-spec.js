const path = require("node:path");
const { CompositeDisposable } = require("lumine");

describe("intentions request ownership across None", () => {
  let editor, grammar, manager, main, subscriptions;
  const action = (title) => ({ title, selected() {} });
  const titles = () => manager.items.map((item) => item.title);
  const settle = async () => {
    for (let index = 0; index < 40; index++) await Promise.resolve();
  };
  const register = (getIntentions, scopes = () => ["*"]) => {
    subscriptions.add(
      main.consumeIntentionsList({
        get grammarScopes() {
          return scopes();
        },
        getIntentions,
      }),
    );
  };

  beforeEach(async () => {
    const grammarPackage = await lumine.packages.activatePackage("language-text");
    await grammarPackage.resourceLoadPromise;
    jasmine.attachToDOM(lumine.workspace.getElement());
    editor = await lumine.workspace.open();
    editor.setText("source");
    grammar = editor.getGrammar();
    const pack = await lumine.packages.activatePackage(path.join(__dirname, ".."));
    main = pack.mainModule;
    manager = main.listManager;
    subscriptions = new CompositeDisposable();
  });

  afterEach(async () => {
    subscriptions.dispose();
    await lumine.packages.deactivatePackage("intentions");
    for (const item of lumine.workspace.getTextEditors()) item.destroy();
  });

  it("never asks a provider for initial None and offers actions again after restoring its grammar", async () => {
    const analyze = jasmine.createSpy("analyze").and.callFake(() => {
      editor.getText();
      return [action("fresh")];
    });
    register(analyze);
    editor.setGrammar(lumine.grammars.nullGrammar);
    await manager.show(editor);
    expect(analyze).not.toHaveBeenCalled();
    expect(manager.isActive()).toBeFalse();
    editor.setGrammar(grammar);
    await manager.show(editor);
    expect(titles()).toEqual(["fresh"]);
  });

  it("resumes before an older provider resolves and rejects its late actions", async () => {
    let finishPrevious;
    register(
      jasmine
        .createSpy("actions")
        .and.returnValues(new Promise((resolve) => (finishPrevious = resolve)), [action("fresh")]),
    );
    const previous = manager.show(editor);
    editor.setGrammar(lumine.grammars.nullGrammar);
    editor.setGrammar(grammar);
    await manager.show(editor);
    expect(titles()).toEqual(["fresh"]);
    finishPrevious([action("obsolete")]);
    await previous;
    expect(titles()).toEqual(["fresh"]);
  });

  it("does not invoke later providers after an earlier provider selects None", async () => {
    register(() => {
      editor.setGrammar(lumine.grammars.nullGrammar);
      return [action("obsolete")];
    });
    const analyze = jasmine.createSpy("later source analysis");
    register(analyze);
    await manager.show(editor);
    expect(analyze).not.toHaveBeenCalled();
    expect(manager.isActive()).toBeFalse();
  });

  it("does not invoke providers if a scope getter selects None", async () => {
    let armed = false;
    const analyze = jasmine.createSpy("analysis").and.returnValue([action("obsolete")]);
    register(analyze, () => {
      if (armed) {
        armed = false;
        editor.setGrammar(lumine.grammars.nullGrammar);
      }
      return ["*"];
    });
    armed = true;
    await manager.show(editor);
    expect(analyze).not.toHaveBeenCalled();
    expect(manager.isActive()).toBeFalse();
  });

  it("cleans provisional decorations when None is selected while mounting", async () => {
    const decorate = editor.decorateMarker.bind(editor);
    let provisional;
    spyOn(editor, "decorateMarker").and.callFake((marker, properties) => {
      const decoration = decorate(marker, properties);
      if (properties.class === "intentions-overlay") {
        provisional = marker;
        editor.setGrammar(lumine.grammars.nullGrammar);
      }
      return decoration;
    });
    register(() => [action("obsolete")]);
    await manager.show(editor);
    expect(manager.isActive()).toBeFalse();
    expect(provisional.isDestroyed()).toBeTrue();
  });

  it("does not let a superseded editor hide a newer editor's actions", async () => {
    let finishPrevious;
    register(({ textEditor }) =>
      textEditor === editor
        ? new Promise((resolve) => (finishPrevious = resolve))
        : [action("other editor")],
    );
    const previous = manager.show(editor);
    const other = await lumine.workspace.open();
    other.setText("other source");
    await manager.show(other);
    editor.setGrammar(lumine.grammars.nullGrammar);
    await settle();
    expect(manager.isActive()).toBeTrue();
    expect(titles()).toEqual(["other editor"]);
    finishPrevious([action("obsolete")]);
    await previous;
    expect(titles()).toEqual(["other editor"]);
  });
});
