Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_014LjkNYUEBgMDrPCqJhZtx8 -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "chart",
        "kpis",
        "c1",
        "c2"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## simdjson-port wins everywhere, and the lead grows with size"
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "bar",
      "layout": "group",
      "x": "size",
      "y": [
        "v1",
        "v2",
        "simdjson-port",
        "serde-wasm"
      ],
      "yScale": "log",
      "unit": "ms",
      "title": "Median parse time (log scale)",
      "data": [
        {
          "size": "1 KB",
          "v1": 0.08,
          "v2": 0.05,
          "simdjson-port": 0.03,
          "serde-wasm": 0.06
        },
        {
          "size": "100 KB",
          "v1": 7.9,
          "v2": 4.1,
          "simdjson-port": 1.2,
          "serde-wasm": 3.8
        },
        {
          "size": "10 MB",
          "v1": 910,
          "v2": 450,
          "simdjson-port": 118,
          "serde-wasm": 402
        }
      ]
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "s1",
        "s2",
        "s3"
      ]
    },
    {
      "id": "s1",
      "component": "Stat",
      "label": "simdjson-port vs v1, 1 KB",
      "value": 2.7,
      "unit": "x faster"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "vs v1, 100 KB",
      "value": 6.6,
      "unit": "x faster"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "vs v1, 10 MB",
      "value": 7.7,
      "unit": "x faster"
    },
    {
      "id": "c1",
      "component": "Callout",
      "tone": "success",
      "title": "Takeaways",
      "text": "simdjson-port is fastest at every size: 3.4x faster than v2 at 100 KB and 3.8x at 10 MB. v2 only halves v1. serde-wasm is about equal to v2, slightly faster at large sizes."
    },
    {
      "id": "c2",
      "component": "Callout",
      "tone": "info",
      "title": "Caveats",
      "text": "Small-input gaps (0.03 vs 0.05 ms) are near timer noise. Medians hide variance, memory use and bundle size, and the benchmark doesn't say what JSON shape was tested. Check those before switching."
    }
  ]
}
```

<!-- pi:result #toolu_014LjkNYUEBgMDrPCqJhZtx8 -->

```
ok
```

<!-- pi -->

The main result is that simdjson-port is the fastest at every size, and its lead grows as inputs get larger. The chart and callouts above show the details.

<!-- you -->

