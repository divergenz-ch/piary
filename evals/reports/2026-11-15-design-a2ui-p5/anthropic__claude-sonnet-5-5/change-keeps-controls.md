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

I'm keeping the controls where the user set them, with turns at 14 and spacing at 3. I'll leave the existing control cells alone and redefine only the drawing cell. I'm adding new cells for color and thickness, defaulting to red and thicker, and then redefining the draw cell in the spiral group.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #bTpGrh -->

```js
const color = view(Inputs.color({label: "Color", value: "#e02020"}))
```

<!-- pi:cell js #n2NDzD -->

```js
const lineWidth = view(Inputs.range([1, 10], {label: "Line width", step: 0.5, value: 4}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: color, strokeWidth: lineWidth}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red and thicker, with a width of 4 instead of the default 1. I added two new controls, "Color" and "Line width", so you can change either one. I didn't re-run the page to look at the result. I left your Turns (14) and Spacing (3) sliders as they were.

<!-- you -->

