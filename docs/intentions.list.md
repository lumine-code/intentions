# intentions.list

Supplies the code actions and quick fixes offered at the cursor.

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| Version     | `1.0.0`                                                    |
| Provided by | `provideIntentionsList()` returning one provider           |
| Consumed by | `consumeIntentionsList(provider)` returning a `Disposable` |
| Owner       | [`intentions`](https://github.com/lumine-code/intentions)  |

Two packages provide it today: `ide-client` turns LSP code actions into intentions, and `linter` turns each message's `solutions` into quick fixes. Both appear in the same list.

## Registration

In your `package.json`:

```json
{
  "providedServices": {
    "intentions.list": {
      "versions": { "1.0.0": "provideIntentionsList" }
    }
  }
}
```

## Contract

```ts
type IntentionsProvider = {
  getIntentions(context: {
    textEditor: TextEditor;
    bufferPosition: Point;
  }): Promise<Intention[]> | Intention[];
  grammarScopes?: string[];
};

type Intention = {
  title: string;
  selected(): void | Promise<void>;
  icon?: string;
  priority?: number;
};
```

| Member                   | Description                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `getIntentions(context)` | Required. Return the actions available at that position, or `[]`.              |
| `grammarScopes`          | Scope names you serve. **Omitting it means every grammar.** Read on every use. |

An intention:

| Field        | Description                                                    |
| ------------ | -------------------------------------------------------------- |
| `title`      | Required. The row's text.                                      |
| `selected()` | Required. Runs the action. May be async.                       |
| `icon`       | An icon name, rendered as `icon-<name>`.                       |
| `priority`   | Higher sorts first, **across all providers**. Defaults to `0`. |

## Minimal example

```js
module.exports = {
  provideIntentionsList() {
    return {
      grammarScopes: ["source.mylang"],
      getIntentions({ textEditor, bufferPosition }) {
        const symbol = symbolAt(textEditor, bufferPosition);
        if (!symbol?.canInline) return [];
        return [
          {
            title: `Inline ${symbol.name}`,
            icon: "law",
            priority: 10,
            selected: () => inline(textEditor, symbol),
          },
        ];
      },
    };
  },
};
```

## Behavior

All matching providers are asked **concurrently**, and their results are flattened and sorted by descending `priority` into one list. There is no per-provider grouping, so `priority` is how you place your actions relative to another package's.

A provider that throws is caught, logged, and treated as returning `[]` — one broken provider does not empty the list.

Results from a superseded invocation are discarded: if the user moves and re-opens the list while providers are still working, the older answers never mount.

When every provider returns nothing, the user gets an informational notification rather than an empty popup.

`getIntentions` runs on demand, not on every keystroke, so it may do real work — but the user is waiting, so keep it responsive.

## Teardown

`consumeIntentionsList` returns a `Disposable` that removes the provider. Return it from your consumer method.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
