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

I'm adding color and stroke-width controls, with red and a thicker default. The turns and spacing sliders stay as they are, at 14 and 3. I'll add two new cells and redefine the draw cell.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #cOlr7a -->

```js
const color = view(Inputs.color({label: "Color", value: "#ff0000"}))
```

<!-- pi:cell js #wId8b -->

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

The spiral is now red and thicker. I added a color picker, set to red, and a line-width slider, set to 4. Your turns and spacing sliders are unchanged. The cells haven't been seen running yet, so I haven't confirmed the new drawing.

<!-- you -->

