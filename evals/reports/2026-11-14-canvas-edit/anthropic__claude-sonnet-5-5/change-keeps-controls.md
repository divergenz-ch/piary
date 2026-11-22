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

I'm keeping the turns at 14 and spacing at 3 as the user set them. Next I'll add color and thickness controls, defaulting to red and thicker, as separate cells, and redefine the drawing cell to use them. I'm still deciding whether the existing slider values should be touched, and for now I'll leave them alone.

<!-- pi:block -->

<!-- pi:artifact @spiral -->

<!-- pi:cell js #u5A8FS -->

```js
const color = view(Inputs.color({label: "Color", value: "#e00000"}))
```

<!-- pi:cell js #Kharyq -->

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

I redrew the spiral in red with a line width of 4. I added a color picker and a thickness slider, so you can change both. I didn't touch your turns (14) and spacing (3) settings. I haven't looked at the rendered spiral, so I can't confirm how it looks.

<!-- you -->

