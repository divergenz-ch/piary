Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01TDGUu1XN8RwCyoMM6ei7uD -->

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
        "t",
        "c"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## simdjson-port wins at every size, and the lead grows with input"
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "bar",
      "layout": "group",
      "yScale": "log",
      "x": "size",
      "y": [
        "v1",
        "v2",
        "simdjson",
        "serde"
      ],
      "labels": {
        "v1": "v1",
        "v2": "v2",
        "simdjson": "simdjson-port",
        "serde": "serde-wasm"
      },
      "unit": "ms",
      "title": "Median time (log scale, lower is better)",
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
      "id": "t",
      "component": "Table",
      "caption": "Speedup of simdjson-port over each other option",
      "columns": [
        "size",
        "v2",
        "serde"
      ],
      "rows": [
        {
          "size": "1 KB",
          "v2": "1.7x",
          "serde": "2x"
        },
        {
          "size": "100 KB",
          "v2": "3.4x",
          "serde": "3.2x"
        },
        {
          "size": "10 MB",
          "v2": "3.8x",
          "serde": "3.4x"
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "info",
      "title": "Takeaways",
      "text": "Throughput is roughly flat (~85 MB/s for simdjson-port at 10 MB vs ~83 MB/s at 100 KB), so scaling is linear. v2 halves v1 but serde-wasm is only slightly faster than v2. Single medians hide variance, and 1 KB differences (0.03 ms) are near timer noise. Check memory use, binary size and API fit before switching."
    }
  ]
}
```

<!-- pi:result #toolu_01TDGUu1XN8RwCyoMM6ei7uD -->

```
ok
```

<!-- pi -->

Take simdjson-port if raw speed is the goal. It is fastest at every size, and its lead over the others widens as inputs get bigger, from about 2x at 1 KB to about 3.5x at 10 MB. The 1 KB gaps are small in absolute terms and close to timer noise, so don't read much into them.

I didn't compare v2 and serde-wasm in detail. They are close to each other, about 10% apart at 100 KB and 10 MB.

I haven't seen variance, memory use, binary size or correctness data. Check those before you commit to a switch.

<!-- you -->

