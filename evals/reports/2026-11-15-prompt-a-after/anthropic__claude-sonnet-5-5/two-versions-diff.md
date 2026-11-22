---
pi: v1
session: eval-two-versions-diff
---

Here are two versions of our greeting function.

Before:

```js
function greet(name) {
  return "Hello " + name;
}
```

After:

```js
function greet(name, punctuation = "!") {
  return `Hello, ${name}${punctuation}`;
}
```

<!-- you -->

What changed between the two? Show me.

<!-- pi:view diff #toolu_014xEiteGN3aCEKh3B9KMa1j -->

```json
{
  "before": "function greet(name) {\n  return \"Hello \" + name;\n}\n",
  "after": "function greet(name, punctuation = \"!\") {\n  return `Hello, ${name}${punctuation}`;\n}\n",
  "path": "greet.js"
}
```

<!-- pi:result #toolu_014xEiteGN3aCEKh3B9KMa1j error -->

```
The data does not fit the "diff" template, so it would render as a plain JSON fence instead of a widget. Expected { "file"?: string, "oldText": string, "newText": string }. Fix the payload or pick another template (see the view-templates skill).
```

<!-- pi:view diff #toolu_01PV2PRfNKXohiDFN53qQx8h -->

```json
{
  "file": "greet.js",
  "oldText": "function greet(name) {\n  return \"Hello \" + name;\n}\n",
  "newText": "function greet(name, punctuation = \"!\") {\n  return `Hello, ${name}${punctuation}`;\n}\n"
}
```

<!-- pi:result #toolu_01PV2PRfNKXohiDFN53qQx8h -->

```
ok
```

<!-- pi -->

Three changes:

1. **New parameter:** `punctuation` is optional and defaults to `"!"`.
2. **Comma added:** the output goes from `Hello Bob` to `Hello, Bob`.
3. **Template literal:** it replaces string concatenation, with no change in behavior.

The default punctuation also adds a trailing `!`. `greet("Bob")` used to return `"Hello Bob"` and now returns `"Hello, Bob!"`. Any caller or test that expects the old string will break.

<!-- you -->

