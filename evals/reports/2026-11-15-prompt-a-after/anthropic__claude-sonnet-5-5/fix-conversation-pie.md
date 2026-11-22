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

I'm checking whether Plot.arc exists as a standard mark, but Plot doesn't include a pie chart, so I'll draw the pie with d3 instead. I also need to redefine cell 9f3e2a, and I'm skipping an extra skill read and going straight to writing it with htl and d3.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
{
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().value(d => d.value).sort(null)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  const svg = d3.create("svg").attr("viewBox", [-w / 2, -w / 2, w, w]).attr("width", w).attr("height", w);
  svg.append("g").selectAll("path").data(arcs).join("path")
    .attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  svg.append("g").attr("text-anchor", "middle").selectAll("text").data(arcs).join("text")
    .attr("transform", d => `translate(${label.centroid(d)})`)
    .attr("fill", "white")
    .text(d => `${d.data.task} ${d.data.value}%`);
  return svg.node();
}
```

<!-- pi:cell js #9f3e2a -->

```js
pie = {
  const data = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
  const w = 360, r = 150;
  const color = d3.scaleOrdinal(data.map(d => d.task), d3.schemeTableau10);
  const arcs = d3.pie().value(d => d.value).sort(null)(data);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const label = d3.arc().innerRadius(r * 0.65).outerRadius(r * 0.65);
  const svg = d3.create("svg").attr("viewBox", [-w / 2, -w / 2, w, w]).attr("width", w).attr("height", w);
  svg.append("g").selectAll("path").data(arcs).join("path")
    .attr("d", arc).attr("fill", d => color(d.data.task)).attr("stroke", "white");
  svg.append("g").attr("text-anchor", "middle").selectAll("text").data(arcs).join("text")
    .attr("transform", d => `translate(${label.centroid(d)})`)
    .attr("fill", "white")
    .text(d => `${d.data.task} ${d.data.value}%`);
  return svg.node();
}
```

<!-- pi:thinking -->

I'm trying to figure out why the "pie = {" line is being parsed as a JavaScript expression statement. I could switch to OJS mode, or keep plain JS and wrap things in an IIFE. I think plain JS with top-level statements and a final expression is the cleanest route.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
const pieData = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
const pieColor = d3.scaleOrdinal(pieData.map(d => d.task), d3.schemeTableau10);
const pieArcs = d3.pie().value(d => d.value).sort(null)(pieData);
const pieR = 150, pieW = 360;
const pieArc = d3.arc().innerRadius(0).outerRadius(pieR);
const pieLabel = d3.arc().innerRadius(pieR * 0.65).outerRadius(pieR * 0.65);
const pieSvg = d3.create("svg").attr("viewBox", [-pieW / 2, -pieW / 2, pieW, pieW]).attr("width", pieW).attr("height", pieW);
pieSvg.append("g").selectAll("path").data(pieArcs).join("path")
  .attr("d", pieArc).attr("fill", d => pieColor(d.data.task)).attr("stroke", "white");
pieSvg.append("g").attr("text-anchor", "middle").selectAll("text").data(pieArcs).join("text")
  .attr("transform", d => `translate(${pieLabel.centroid(d)})`)
  .attr("fill", "white")
  .text(d => `${d.data.task} ${d.data.value}%`);
pieSvg.node()
```

<!-- pi:thinking -->

I need to display the pie chart, so I'll call display on the pie SVG's node.

<!-- pi:block -->

<!-- pi:cell js #9f3e2a -->

```js
const pieData = [{ task: "meetings", value: 30 }, { task: "coding", value: 50 }, { task: "review", value: 20 }];
const pieColor = d3.scaleOrdinal(pieData.map(d => d.task), d3.schemeTableau10);
const pieArcs = d3.pie().value(d => d.value).sort(null)(pieData);
const pieR = 150, pieW = 360;
const pieArc = d3.arc().innerRadius(0).outerRadius(pieR);
const pieLabel = d3.arc().innerRadius(pieR * 0.65).outerRadius(pieR * 0.65);
const pieSvg = d3.create("svg").attr("viewBox", [-pieW / 2, -pieW / 2, pieW, pieW]).attr("width", pieW).attr("height", pieW);
pieSvg.append("g").selectAll("path").data(pieArcs).join("path")
  .attr("d", pieArc).attr("fill", d => pieColor(d.data.task)).attr("stroke", "white");
pieSvg.append("g").attr("text-anchor", "middle").selectAll("text").data(pieArcs).join("text")
  .attr("transform", d => `translate(${pieLabel.centroid(d)})`)
  .attr("fill", "white")
  .text(d => `${d.data.task} ${d.data.value}%`);
display(pieSvg.node());
```

<!-- pi -->

I rewrote the pie chart cell (#9f3e2a), but I haven't seen it render, so check that it shows up now.

The first version failed because Plot has no pie mark, and `Plot.arc` isn't one. I switched to drawing the pie directly with d3. It shows meetings 30%, coding 50% and review 20%, each labelled on its slice.

<!-- you -->

