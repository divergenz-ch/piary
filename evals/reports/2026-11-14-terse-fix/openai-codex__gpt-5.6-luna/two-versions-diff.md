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

<!-- pi -->

The function now:

- Accepts an optional `punctuation` parameter, defaulting to `"!"`.
- Uses a template literal instead of string concatenation.
- Adds a comma after `"Hello"` and appends the punctuation.

Example: `greet("Ada")` returns `"Hello, Ada!"`.

<!-- you -->

