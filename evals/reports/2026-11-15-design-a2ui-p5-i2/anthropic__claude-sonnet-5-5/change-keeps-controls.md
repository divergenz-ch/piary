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

I'm keeping the controls the user already set, turns at 14 and spacing at 3. Next I'm adding color and width controls, defaulting to red and thicker, and redefining the draw cell with new control cells. The turns and spacing cells stay untouched.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #1EVFHn -->

```js
const color = view(Inputs.color({label: "Color", value: "#e00000"}))
```

<!-- pi:cell js #8GX2rv -->

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

The spiral is now red and thicker. I added two new sliders, Color (red) and Thickness (4), and haven't confirmed the redrawn spiral on the page. Your Turns (14) and Spacing (3) settings are unchanged.

<!-- you -->

