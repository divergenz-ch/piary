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

I'm adding color and width controls and redefining the draw cell, while leaving the turns and spacing controls alone since the user already changed those values to 14 and 3. The color input defaults to red and the width range defaults to 3.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #cOl6r1 -->

```js
const strokeColor = view(Inputs.color({label: "Colour", value: "#e00000"}))
```

<!-- pi:cell js #wId7th -->

```js
const lineWidth = view(Inputs.range([0.5, 10], {label: "Line width", step: 0.5, value: 3}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: strokeColor, strokeWidth: lineWidth}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red with a line width of 3. I added a colour picker and a line-width slider so you can change both. Your turns and spacing settings (14 and 3) are unchanged.

I haven't seen the cells run in the page yet, so the change isn't verified.

<!-- you -->

