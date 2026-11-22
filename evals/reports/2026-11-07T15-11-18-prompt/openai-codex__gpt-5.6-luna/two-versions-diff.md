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

- Added optional `punctuation` parameter, defaulting to `"!"`.
- Changed output from `"Hello " + name` to a template literal.
- Added a comma after `"Hello"` and appends the punctuation.

Example: `greet("Sam")` now returns `"Hello, Sam!"` instead of `"Hello Sam"`.

<!-- you -->

