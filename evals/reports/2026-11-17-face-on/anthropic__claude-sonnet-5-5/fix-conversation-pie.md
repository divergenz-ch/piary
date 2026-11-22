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

I'm realizing Plot doesn't have an arc mark in the version I'm using, so I'll draw the pie with d3.pie and d3.arc through htl SVG instead. I also passed a made-up cell id earlier, and the result only returned "ok" without an id, so I'll reuse the same id I already used.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const size = 320, r = size / 2 - 10;
  const color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  const svg = d3.create("svg").attr("viewBox", [-size / 2, -size / 2, size, size]).attr("width", size).attr("height", size);
  svg.selectAll("path").data(arcs).join("path").attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  svg.selectAll("text").data(arcs).join("text")
    .attr("transform", d => `translate(${label.centroid(d)})`).attr("text-anchor", "middle")
    .attr("fill", "white").attr("font-size", 12)
    .text(d => `${d.data.task} ${d.data.value}%`);
  return svg.node();
}
```

<!-- pi -->

Wrap it so the cell is a single expression.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
(() => {
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const size = 320, r = size / 2 - 10;
  const color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  const svg = d3.create("svg").attr("viewBox", [-size / 2, -size / 2, size, size]).attr("width", size).attr("height", size);
  svg.selectAll("path").data(arcs).join("path").attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  svg.selectAll("text").data(arcs).join("text")
    .attr("transform", d => `translate(${label.centroid(d)})`).attr("text-anchor", "middle")
    .attr("fill", "white").attr("font-size", 12)
    .text(d => `${d.data.task} ${d.data.value}%`);
  return svg.node();
})()
```

<!-- pi -->

I rebuilt the pie chart with d3. The first version used `Plot.arc`, which doesn't exist in Plot, and its `value` option was misspelled. The cell now runs without errors, but I haven't seen it render on the page. It shows meetings 30%, coding 50% and review 20%, each slice labelled.

<!-- you -->

