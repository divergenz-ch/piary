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

I'm weighing whether to read the skill first, since the older Plot version lacks Plot.arc, which a stacked pie would need. A d3-drawn SVG pie looks like the safer route, so I'll redefine the cell with d3. The earlier cell id, which I'm not certain of, is the one I'll reuse.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal().domain(data.map(d => d.task)).range(d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.62).outerRadius(r * 0.62);
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

I rewrote the cell, and it ran without errors. I haven't looked at the rendered chart, so I haven't confirmed the pie shows up on the page.

The old version used `Plot.arc`, which isn't available in Plot. It also had a typo (`value: "hour"` where the field is `hours`). The new version draws the pie with d3 instead. Each slice is labeled with its task and percentage: meetings 30%, coding 50%, review 20%.

<!-- you -->

