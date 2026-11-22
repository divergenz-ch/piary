---
pi: v1
session: eval-fix-conversation-pie
---

Draw a pie chart of our time split: meetings 30, coding 50, review 20.

<!-- pi -->

Here is the split as a pie chart.

<!-- pi:cell js #9f3e2a -->

```js
Plot.plot({
  marks: [
    Plot.arc([{ task: "meetings", hours: 30 }, { task: "coding", hours: 50 }, { task: "review", hours: 20 }], {
      value: "hour",
      fill: "task"
    })
  ]
})
```

<!-- you -->

The pie diagram doesn't render. Fix it.

<!-- pi:thinking -->

Plot.arc can't draw pie slices on its own, so I'll switch to d3.pie with raw SVG arcs. I also need to redefine the cell, since the id I passed (9f3e2a) returned an unclear result.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  return htl.svg`<svg viewBox="${-w/2} ${-w/2} ${w} ${w}" width="${w}" height="${w}">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}" stroke="white"></path>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
}
```

<!-- pi:cell js #9f3e2a -->

```js
pie = {
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  return htl.svg`<svg viewBox="${-w/2} ${-w/2} ${w} ${w}" width="${w}" height="${w}">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}" stroke="white"></path>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
}
```

<!-- pi:thinking -->

The js mode seems to want plain statements or expressions, so I'll wrap the code in an IIFE to make it an expression.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
(() => {
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  return htl.svg`<svg viewBox="${-w/2} ${-w/2} ${w} ${w}" width="${w}" height="${w}">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}" stroke="white"></path>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
})()
```

<!-- pi -->

I rewrote the pie chart cell (#9f3e2a). I haven't seen it render, so I can't confirm it works.

The old cell used `Plot.arc` with a `"hour"` field that doesn't exist in the data, and `Plot.arc` doesn't cut data into slices anyway. The new cell uses `d3.pie` and `d3.arc` to draw the three slices: meetings 30%, coding 50% and review 20%. Each slice has a label.

<!-- you -->

