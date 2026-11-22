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

Draw it in red, and thicker.

<!-- pi:thinking -->

I need to add color and stroke-width controls while keeping the existing ones. I'm deciding whether to read the skill first, but I'll skip it since the cells worked before. Next I'm creating those controls and redefining the drawing cell dr4wSp.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #B8vHKS -->

```js
const color = view(Inputs.color({label: "Color", value: "#e00000"}))
```

<!-- pi:cell js #j1QWYc -->

```js
const lineWidth = view(Inputs.range([0.5, 12], {label: "Line width", step: 0.5, value: 4}))
```

<!-- pi:artifact @spiral -->

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: color, strokeWidth: lineWidth}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red with a line width of 4. I added color and line-width controls next to the turns and spacing sliders. I haven't looked at the rendered chart, so I can't confirm how it looks.

<!-- you -->

