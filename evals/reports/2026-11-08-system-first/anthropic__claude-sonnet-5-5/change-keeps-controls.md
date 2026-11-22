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

I'm keeping the turns and spacing controls as the user moved them, and adding color and width controls set to red and a thicker stroke. The default plot width is 1.5, so I'm going with 4 for the thicker setting.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #rdo6Zx -->

```js
const color = view(Inputs.color({label: "Color", value: "#e00000"}))
```

<!-- pi:cell js #wjg6UA -->

```js
const width = view(Inputs.range([0.5, 12], {label: "Line width", step: 0.5, value: 4}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: color, strokeWidth: width}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red and thicker, with a line width of 4. I added a color picker and a line-width slider, so you can change both. Your turns (14) and spacing (3) settings are unchanged. I haven't looked at the rendered chart.

<!-- you -->

