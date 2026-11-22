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

- Added an optional `punctuation` parameter, defaulting to `"!"`.
- Changed string concatenation to a template literal.
- Added a comma after `"Hello"`.
- Appended the punctuation to the greeting.

```diff
-function greet(name) {
-  return "Hello " + name;
+function greet(name, punctuation = "!") {
+  return `Hello, ${name}${punctuation}`;
}
```

<!-- you -->

