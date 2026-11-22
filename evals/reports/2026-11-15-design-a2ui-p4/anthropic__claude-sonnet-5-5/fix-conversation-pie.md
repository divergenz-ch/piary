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

I've found that Plot has no arc mark, so I'll draw the pie directly with d3 and SVG instead. I'm redefining the cell with id 9f3e2a to return a plain SVG node without htl, and I'm skipping the skill lookup.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, h = 300, r = 120;
  const color = d3.scaleOrdinal().domain(data.map(d => d.task)).range(d3.schemeTableau10);
  const arcs = d3.pie().sort(null).value(d => d.value)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  const svg = d3.create("svg").attr("viewBox", [0, 0, w, h]).attr("width", w).attr("height", h)
    .style("font", "12px sans-serif");
  const g = svg.append("g").attr("transform", `translate(${w / 2 - 40},${h / 2})`);
  g.selectAll("path").data(arcs).join("path").attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  g.selectAll("text").data(arcs).join("text")
    .attr("transform", d => `translate(${label.centroid(d)})`).attr("text-anchor", "middle")
    .attr("fill", "white").text(d => d.data.value + "%");
  const lg = svg.append("g").attr("transform", `translate(${w - 90},${h / 2 - 30})`);
  data.forEach((d, i) => {
    lg.append("rect").attr("y", i * 22).attr("width", 12).attr("height", 12).attr("fill", color(d.task));
    lg.append("text").attr("x", 18).attr("y", i * 22 + 11).text(d.task);
  });
  return svg.node();
}
```

<!-- pi -->

I rewrote the cell (#9f3e2a) with d3 to draw the pie. The first version used `Plot.arc`, which doesn't exist, and a `"hour"` field that wasn't in the data. The new cell shows meetings, coding and review as slices labelled 30%, 50% and 20%, with a legend. The cell ran without errors, but I haven't looked at the rendered chart.

<!-- you -->

