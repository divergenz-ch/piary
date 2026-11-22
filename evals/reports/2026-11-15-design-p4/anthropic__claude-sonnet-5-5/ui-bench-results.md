Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01ToqpfsmmrydgmXcV1Agd3j -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "chart",
        "stats",
        "c1",
        "c2"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## simdjson-port wins at every size, and its lead grows with input"
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
        "simdjson",
        "serde"
      ],
      "yScale": "log",
      "unit": "ms",
      "labels": {
        "v1": "v1",
        "v2": "v2",
        "simdjson": "simdjson-port",
        "serde": "serde-wasm"
      },
      "title": "Median ms (log scale)",
      "data": [
        {
          "size": "1 KB",
          "v1": 0.08,
          "v2": 0.05,
          "simdjson": 0.03,
          "serde": 0.06
        },
        {
          "size": "100 KB",
          "v1": 7.9,
          "v2": 4.1,
          "simdjson": 1.2,
          "serde": 3.8
        },
        {
          "size": "10 MB",
          "v1": 910,
          "v2": 450,
          "simdjson": 118,
          "serde": 402
        }
      ]
    },
    {
      "id": "stats",
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
      "tone": "info",
      "title": "Takeaways",
      "text": "v2 is a steady ~2x over v1. serde-wasm is only slightly better than v2 (~10% at large sizes). simdjson-port is ~3.4–3.8x faster than v2 at 100 KB and above, and the gain levels off past 100 KB."
    },
    {
      "id": "c2",
      "component": "Callout",
      "tone": "warning",
      "title": "Caveats",
      "text": "1 KB differences (0.03 vs 0.05 ms) are near timer noise. Medians hide tail latency, and the data doesn't show memory use, binary size, or correctness, which matter for a port."
    }
  ]
}
```

<!-- pi:result #toolu_01ToqpfsmmrydgmXcV1Agd3j -->

```
ok
```

<!-- pi -->

The simdjson-port is the fastest at every size, and its lead is largest on big inputs. The chart and callouts above have the detail.

<!-- you -->

