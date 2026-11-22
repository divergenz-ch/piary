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

<!-- pi:view diff #toolu_01SZoQkKkvy52y2ePhjMFvKb -->

```json
{
  "before": "function greet(name) {\n  return \"Hello \" + name;\n}\n",
  "after": "function greet(name, punctuation = \"!\") {\n  return `Hello, ${name}${punctuation}`;\n}\n",
  "path": "greet.js"
}
```

<!-- pi:result #toolu_01SZoQkKkvy52y2ePhjMFvKb error -->

```
The data does not fit the "diff" template, so it would render as a plain JSON fence instead of a widget. Expected { "file"?: string, "oldText": string, "newText": string }. Fix the payload or pick another template (see the view-templates skill).
```

<!-- pi:view diff #toolu_01PRHhrfaYDwxa7ZSH9AsuYy -->

```json
{
  "file": "greet.js",
  "oldText": "function greet(name) {\n  return \"Hello \" + name;\n}\n",
  "newText": "function greet(name, punctuation = \"!\") {\n  return `Hello, ${name}${punctuation}`;\n}\n"
}
```

<!-- pi:result #toolu_01PRHhrfaYDwxa7ZSH9AsuYy -->

```
ok
```

<!-- pi -->

Three changes:

1. **New parameter:** `punctuation` defaults to `"!"`, so the caller can change the ending.
2. **Comma added:** the output goes from `Hello Ada` to `Hello, Ada`.
3. **Template literal:** string concatenation (`"Hello " + name`) is replaced by a template literal.

The visible output also changes. `greet("Ada")` used to return `Hello Ada` and now returns `Hello, Ada!`. Any caller or test that expects the old string will break.

<!-- you -->

