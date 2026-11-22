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

Plot.arc isn't part of Plot, so I'll build the pie with d3's pie generator inside an HTL SVG instead, and redefine cell 9f3e2a to use that approach.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const r = 120, color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  return htl.html`<svg viewBox="${-r - 10} ${-r - 10} ${2 * r + 20} ${2 * r + 20}" width="320">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}"/>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white" font-size="12">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
}
```

<!-- pi:cell js #9f3e2a -->

```js
(() => {
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const r = 120, color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  return htl.html`<svg viewBox="${-r - 10} ${-r - 10} ${2 * r + 20} ${2 * r + 20}" width="320">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}"/>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white" font-size="12">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
})()
```

<!-- pi -->

I rewrote the cell, but I haven't seen it render, so I can't confirm the pie draws yet.

The first version failed because `Plot.arc` doesn't exist, and the `value: "hour"` option was also wrong. The new version builds the pie directly with `d3.pie` and `d3.arc`. It shows meetings 30%, coding 50% and review 20%, each labelled on its slice.

<!-- you -->

