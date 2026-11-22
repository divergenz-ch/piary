---
pi: v1
session: eval-change-keeps-controls
---

Draw me an Archimedean spiral.

<!-- pi -->

A spiral, with its turns and spacing on sliders.

<!-- pi:artifact @spiral -->

<!-- pi:cell js #tUrn5x -->

```js
const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 6}))
```

<!-- pi:cell js #sPac3y -->

```js
const spacing = view(Inputs.range([1, 20], {label: "Spacing", step: 1, value: 6}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: "steelblue"}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- you -->

[cell values] {"turns":14,"spacing":3}

[artifact] spiral — edit by id

Draw it in red, and thicker.

<!-- pi:thinking -->

I'm adding color and width controls as new cells and leaving the turns and spacing sliders at their current values. I'm also thinking about whether the draw cell needs redefining to use them.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #cOlr7k -->

```js
const color = view(Inputs.color({label: "Color", value: "#ff0000"}))
```

<!-- pi:cell js #wIdt8m -->

```js
const width = view(Inputs.range([0.5, 10], {label: "Thickness", step: 0.5, value: 3}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: color, strokeWidth: width}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red and thicker. I added Color and Thickness controls, set to red and 3. Your Turns (14) and Spacing (3) settings are unchanged. I haven't seen the cells run yet, so the new look is unchecked.

<!-- you -->

