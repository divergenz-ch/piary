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

Plot.arc probably isn't part of Plot, so I'll switch to a d3 pie drawn in SVG. I'm redefining cell 9f3e2a to use d3 for that.

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
  const svg = d3.create("svg").attr("viewBox", [-w / 2, -w / 2, w, w]).attr("width", w).attr("height", w);
  const g = svg.selectAll("g").data(arcs).join("g");
  g.append("path").attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  g.append("text").attr("transform", d => `translate(${label.centroid(d)})`).attr("text-anchor", "middle")
    .attr("fill", "white").attr("font-size", 13)
    .text(d => `${d.data.task} ${d.data.value}%`);
  return svg.node();
}
```

<!-- pi -->

Wrapping it in a function call instead of a bare block.

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
  const svg = d3.create("svg").attr("viewBox", [-w / 2, -w / 2, w, w]).attr("width", w).attr("height", w);
  const g = svg.selectAll("g").data(arcs).join("g");
  g.append("path").attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  g.append("text").attr("transform", d => `translate(${label.centroid(d)})`).attr("text-anchor", "middle")
    .attr("fill", "white").attr("font-size", 13)
    .text(d => `${d.data.task} ${d.data.value}%`);
  return svg.node();
})()
```

<!-- pi -->

I rebuilt the pie chart (cell #9f3e2a) with d3 arcs. The first version used `Plot.arc`, which doesn't exist in Plot, and its value field was misspelled (`"hour"`). The new cell ran without errors, but I haven't seen it draw yet. Each slice is labelled with its name and percentage: meetings 30%, coding 50%, review 20%.

<!-- you -->

