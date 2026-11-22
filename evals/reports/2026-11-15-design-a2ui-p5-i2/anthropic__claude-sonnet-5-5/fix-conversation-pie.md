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

Plot.arc isn't available in Plot for pie charts, so I'll draw the pie directly with d3 and SVG. I'm weighing whether to read the skill first or just proceed, and I should still check the cell semantics. I'll go ahead with d3 and htl, redefining cell 9f3e2a.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal().domain(data.map(d => d.task)).range(d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  const svg = d3.create("svg").attr("viewBox", [-w / 2, -w / 2, w, w]).attr("width", w).attr("height", w);
  svg.selectAll("path").data(arcs).join("path")
    .attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  svg.selectAll("text").data(arcs).join("text")
    .attr("transform", d => `translate(${label.centroid(d)})`)
    .attr("text-anchor", "middle").attr("fill", "white").attr("font-size", 13)
    .text(d => `${d.data.task} ${d.data.value}%`);
  return svg.node();
}
```

<!-- pi -->

I fixed the pie chart, and the cell now runs without an error. I haven't looked at the rendered chart.

The original cell used `Plot.arc`, which doesn't exist in Observable Plot. It also pointed at a field called `hour` that wasn't in the data. I redrew the chart with d3's pie layout instead. Each slice is labeled with its task name and percentage: meetings 30, coding 50 and review 20.

<!-- you -->

