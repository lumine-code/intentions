# intentions

Show code actions and quick fixes at the cursor.

Intentions come from provider packages — language-server backends, the linter, and other tools — and are shown as a navigable list in an overlay decoration right in the text editor.

## Features

- **Cursor-anchored list**: shows the merged code actions of every matching provider at the cursor position.
- **Priority ordering**: intentions from all providers are merged and sorted by priority, highest first.
- **Keyboard navigation**: move through the list with the core movement commands, confirm to run the selected action, cancel to close.
- **Mouse support**: hovering selects and clicking runs an intention without moving focus out of the editor.
- **Octicon icons**: an intention with an `icon` renders its octicon in front of the title.
- **Dismissal**: the list closes on cancel, on confirming an action, and when the editor is scrolled, edited, or loses focus; when no provider has an intention, a subtle notification says so.

## Installation

To install `intentions` search for _intentions_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/intentions`.

## Commands

Commands available in `atom-text-editor:not([mini])`:

- `intentions:show`: gather intentions from all providers and show the list at the cursor; while a list is open it is closed first, so lists never stack.

## Customization

The list appearance can be tweaked from your `styles.less`:

```less
.intentions-list {
  max-width: 640px;
  ol.list-group li.selected {
    background-color: var(--background-color-info);
  }
}
```

## Services

- **[intentions.list](docs/intentions.list.md)** (`^1.0.0`): consumed to gather code actions for the cursor position from providers such as IDE backend packages or the linter.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
