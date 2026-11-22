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

I'm leaving the slider values alone, since the user already set turns to 14 and spacing to 3. I'll add color and stroke-width controls, defaulting to red and a thicker line, then add new cells and redefine the drawing cell, while keeping the slider cells as they are so their values aren't reset.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #cOl0r1 -->

```js
const color = view(Inputs.color({label: "Color", value: "#e00000"}))
```

<!-- pi:cell js #wId7th -->

```js
const width = view(Inputs.range([0.5, 10], {label: "Line width", step: 0.5, value: 4}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: color, strokeWidth: width}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red with a line width of 4, up from Plot's default of 1.5. I added Color and Line width controls so you can change both. I left your Turns (14) and Spacing (3) settings as they were.

<!-- you -->

