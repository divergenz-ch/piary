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

I need controls for color and thickness, defaulting to red and a thicker line, while leaving the turns and spacing controls untouched. I'll put the new color and width controls in their own cells and redefine the drawing cell to reference them, without redefining the turns and spacing cells so their values aren't reset.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #MMty8L -->

```js
const color = view(Inputs.color({label: "Colour", value: "#e00000"}))
```

<!-- pi:cell js #UJQkdP -->

```js
const thickness = view(Inputs.range([0.5, 10], {label: "Thickness", step: 0.5, value: 4}))
```

<!-- pi:cell js #dr4wSp -->

```js
(() => {
  const pts = d3.range(0, turns * 2 * Math.PI, 0.05).map((t) => [spacing * t * Math.cos(t), spacing * t * Math.sin(t)]);
  return Plot.line(pts, {stroke: color, strokeWidth: thickness}).plot({aspectRatio: 1, axis: null});
})()
```

<!-- pi -->

The spiral is now red and thicker. I added Colour and Thickness controls, set to red and 4. I left your Turns (14) and Spacing (3) settings as they were.

I haven't seen the cells run, so the result is unchecked.

<!-- you -->

