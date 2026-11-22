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

I'm going to leave the slider cells alone and add separate color and width controls as new cells, then point the drawing cell at them. The color defaults to red and the width to 3.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #WW1toU -->

```js
const color = view(Inputs.color({label: "Colour", value: "#e00000"}))
```

<!-- pi:cell js #TWuEEh -->

```js
const lineWidth = view(Inputs.range([0.5, 10], {label: "Line width", step: 0.5, value: 3}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: color, strokeWidth: lineWidth}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red and thicker, with a stroke width of 3. I added colour and line-width controls, set to those values. I haven't seen the cells run, so the result is unchecked. Your turns (14) and spacing (3) settings are unchanged.

<!-- you -->

