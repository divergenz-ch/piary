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

Plot has no pie arc mark, so I'll draw the pie directly in SVG with d3's arc and pie helpers, wrapped in htl. The earlier cell id was one I picked myself, and the cell only returned "ok", so I'll redefine it and try again. For the slice fills I'll use d3.schemeTableau10, since the pie needs distinct colours.

I'm checking whether the choice of colours still holds up, since the pie needs distinct fills.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const r = 120, color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().value(d => d.value).sort(null)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.6).outerRadius(r * 0.6);
  return htl.html`<svg viewBox="${-r-10} ${-r-10} ${2*r+20} ${2*r+20}" width="320" style="max-width:100%">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}" stroke="white"><title>${a.data.task}: ${a.data.value}%</title></path>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white" font-size="12">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
}
```

<!-- pi -->

Cells take a bare expression, so I'll drop the `return`.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
pie = {
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const r = 120, color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().value(d => d.value).sort(null)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.6).outerRadius(r * 0.6);
  return htl.html`<svg viewBox="${-r-10} ${-r-10} ${2*r+20} ${2*r+20}" width="320" style="max-width:100%">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}" stroke="white"><title>${a.data.task}: ${a.data.value}%</title></path>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white" font-size="12">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
}
```

<!-- pi:thinking -->

I'm wondering whether the js block is being parsed as statements, since "pie = {" is OJS syntax. I'll switch to plain JavaScript and wrap it in an IIFE so it works as an expression.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
(() => {
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const r = 120, color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().value(d => d.value).sort(null)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.6).outerRadius(r * 0.6);
  return htl.html`<svg viewBox="${-r-10} ${-r-10} ${2*r+20} ${2*r+20}" width="320" style="max-width:100%">
    ${arcs.map(a => htl.svg`<path d="${arc(a)}" fill="${color(a.data.task)}" stroke="white"><title>${a.data.task}: ${a.data.value}%</title></path>
      <text transform="translate(${label.centroid(a)})" text-anchor="middle" fill="white" font-size="12">${a.data.task} ${a.data.value}%</text>`)}
  </svg>`;
})()
```

<!-- pi -->

I rewrote the cell, and the pie chart should now render. The cell reported "ok", but it hasn't been seen running, so I haven't confirmed the chart shows up.

The original used `Plot.arc`, which doesn't make pie slices. It also set `value: "hour"`, but the field is named `hours`. The new version builds the pie with `d3.pie` and draws it as SVG. It has three labelled slices: meetings 30%, coding 50% and review 20%.

<!-- you -->

