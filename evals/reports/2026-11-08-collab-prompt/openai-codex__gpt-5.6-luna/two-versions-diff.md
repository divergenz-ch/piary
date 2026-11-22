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

```diff
-function greet(name) {
-  return "Hello " + name;
+function greet(name, punctuation = "!") {
+  return `Hello, ${name}${punctuation}`;
}
```

Changes:
- Added optional `punctuation` parameter, defaulting to `"!"`.
- Added a comma after `"Hello"`.
- Added configurable punctuation to the output.
- Switched from string concatenation to a template literal.

Example: `greet("Sam", "?")` → `"Hello, Sam?"`

<!-- you -->

