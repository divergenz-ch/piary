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

- Adds an optional `punctuation` parameter, defaulting to `"!"`.
- Changes the output from `"Hello " + name` to a template literal.
- Adds a comma after “Hello” and appends the punctuation.

```diff
-function greet(name) {
-  return "Hello " + name;
+function greet(name, punctuation = "!") {
+  return `Hello, ${name}${punctuation}`;
}
```

<!-- you -->

