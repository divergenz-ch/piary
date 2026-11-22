---
pi: v1
session: eval-tour-question
---

<!-- pi:note -->

# Welcome to Piary

This page is one markdown document. You and the agent both write in it, and
you can edit any of it, any time: the answers too.

## Things on the page run

Drag the slider. The sentence under it changes, with no agent involved.

<!-- pi:cell js #tour-coffee -->

```js
(() => {
  const cups = Inputs.range([1, 12], {step: 1, value: 3, label: "Cups of coffee"});
  const said = htl.html`<p class="tour-coffee"></p>`;
  const say = () => (said.textContent = `${cups.value} cups is about ${cups.value * 95} mg of caffeine.`);
  cups.addEventListener("input", say);
  say();
  return htl.html`${cups}${said}`;
})()
```

<!-- pi:note -->

## Ask, and change your mind

Here is a question and the answer it got. Put the caret in the question,
change "three" to "five", and press ⌘⏎: the new answer replaces the old one,
right here.

<!-- you -->

Give me five names for a houseplant.

<!-- pi -->

Here are five names for a houseplant:

1. Fernando
2. Leaf Erikson
3. Basil Fawlty
4. Photosynthia
5. Sir Plantsalot

<!-- pi -->

1. Fernando
2. Leaf Erikson
3. Spike

<!-- pi:note -->

## Your turn

Write anything in the empty prompt below and press ⌘⏎. The answer lands under
the prompt the caret is in, wherever that is on the page. pi answers with the
providers it already has; if it has none, a red **Sign in** button appears at
the bottom right. Help → Welcome to Piary brings this page back.

<!-- you -->

