// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-gfm", "linter", "linter-panel", "autocomplete", "spell-check"],
  viewport: { width: 1100, height: 500 },
  async before() {},
  async prepare(context) {
    const { lumine, state, fixture, open } = context;
    state.editor = await open("more/README.md");
    await lumine.project.setPaths([fixture("more")]);
    lumine.config.set("spell-check.locales", ["en-US"]);
    lumine.config.set("spell-check.severity", "warning");
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Choose a spelling correction from the available code actions.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          state.editor.selectAll();
          lumine.commands.dispatch(
            lumine.views.getView(state.editor),
            "spell-check:check-selected",
          );
          state.editor.setCursorBufferPosition([2, 9]);
          await new Promise((resolve) => setTimeout(resolve, 1800));
        }
        {
          lumine.commands.dispatch(lumine.views.getView(state.editor), "intentions:show");
        }
      },
      ready() {
        return Boolean(document.body.innerText.includes("algorithm"));
      },
    },
  ],
  async cleanup(context) {
    const { lumine } = context;
    lumine.config.unset("spell-check.locales");
    lumine.config.unset("spell-check.severity");
  },
};
