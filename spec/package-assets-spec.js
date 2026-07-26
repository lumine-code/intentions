const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(root, rel));

// Guards for the package assets: intentions is a greenfield Lumine package
// (the steelbrain/intentions package inspired the service contracts, but no
// code was ported), so no legacy formats or references may appear.
describe("intentions package assets", () => {
  it("ships the keymap as JSON, not CSON", () => {
    expect(exists("keymaps/intentions.json")).toBe(true);
    expect(exists("keymaps/intentions.cson")).toBe(false);
  });

  it("binds the show command and routes enter/escape while the list is open", () => {
    const keymap = JSON.parse(read("keymaps/intentions.json"));
    expect(keymap["atom-text-editor:not([mini])"]["alt-enter"]).toBe("intentions:show");
    expect(keymap["atom-text-editor.intentions-active"]["enter"]).toBe("core:confirm");
    expect(keymap["atom-text-editor.intentions-active"]["escape"]).toBe("core:cancel");
  });

  it("ships a CSS stylesheet built on custom properties, not Less", () => {
    expect(exists("styles/intentions.css")).toBe(true);
    expect(exists("styles/intentions.less")).toBe(false);
    const css = read("styles/intentions.css");
    expect(css).toContain(".intentions-list");
    expect(css).toContain("var(--");
    expect(css).not.toContain("@import");
    expect(css).not.toMatch(/\bfade\(|\bcontrast\(|\blighten\(|\bdarken\(|@[a-z-]+:/);
  });

  it("is named `intentions`, owned by lumine-code, with no runtime dependencies", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.name).toBe("intentions");
    expect(pkg.author).toBe("lumine-code");
    expect(pkg.repository).toBe("https://github.com/lumine-code/intentions");
    expect(pkg.bugs.url).toBe("https://github.com/lumine-code/intentions/issues");
    expect(pkg.main).toBe("./lib/main");
    expect(pkg.license).toBe("MIT");
    expect(pkg.dependencies).toBeUndefined();
  });

  it("consumes the list service and provides none", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.consumedServices["intentions.list"].versions["^1.0.0"]).toBe(
      "consumeIntentionsList",
    );
    // Dropped: nothing ever provided it and no UI rendered it.
    expect(pkg.consumedServices["intentions.highlight"]).toBeUndefined();
    expect(pkg.providedServices).toBeUndefined();
  });

  it("keeps the README description in sync with package.json", () => {
    const pkg = JSON.parse(read("package.json"));
    const lines = read("README.md").split(/\r?\n/);
    expect(lines[0]).toBe("# intentions");
    const sentence = lines.find((line, index) => index > 0 && line.trim().length > 0);
    expect(sentence).toBe(pkg.description);
  });

  it("has no editor-rebrand leftovers or legacy tooling in lib", () => {
    const libDir = path.join(root, "lib");
    for (const file of fs.readdirSync(libDir)) {
      if (!file.endsWith(".js")) continue;
      const src = fs.readFileSync(path.join(libDir, file), "utf8");
      expect(src.toLowerCase()).not.toContain("pulsar");
      expect(src).not.toContain("solid-js");
      expect(src).not.toContain("etch");
    }
    expect(exists("tsconfig.json")).toBe(false);
    expect(exists("src")).toBe(false);
  });
});
