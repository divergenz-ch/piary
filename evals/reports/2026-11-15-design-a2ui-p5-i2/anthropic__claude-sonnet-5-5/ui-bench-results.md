Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01GuJf96v42cpeKVXrAM81u4 -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "kpis",
        "chart",
        "c"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## simdjson-port wins at every size, and its lead grows with input"
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
      "label": "Speedup vs v1, 1 KB",
      "value": 2.7,
      "unit": "x"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Speedup vs v1, 100 KB",
      "value": 6.6,
      "unit": "x"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "Speedup vs v1, 10 MB",
      "value": 7.7,
      "unit": "x"
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
      "title": "Median ms (log scale)",
      "labels": {
        "simdjson": "simdjson-port",
        "serde": "serde-wasm"
      },
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
      "id": "c",
      "component": "Callout",
      "tone": "info",
      "title": "Takeaways",
      "text": "v2 only halves v1 (~2x). serde-wasm is slightly ahead of v2 at scale (~10% at 10 MB) but still ~3.4x slower than simdjson-port. At 1 KB differences are tens of microseconds, likely noise or call overhead. Check memory use, correctness and portability before switching."
    }
  ]
}
```

<!-- pi:result #toolu_01GuJf96v42cpeKVXrAM81u4 -->

```
ok
```

<!-- pi -->

**Main takeaway:** simdjson-port is fastest at every size. Its lead over v1 grows from about 2.7x at 1 KB to about 7.7x at 10 MB, so it matters most for large inputs.

- **v2:** it is about 2x faster than v1 at every size, which is a steady gain but not a big one.
- **serde-wasm:** it is slightly faster than v2 at 100 KB and above, and slightly slower at 1 KB. It is still about 3.4x slower than simdjson-port at 10 MB.
- **1 KB:** the gaps are only tens of microseconds. Call overhead or measurement noise could account for them, so don't read much into that row.

These are median times only. Before switching, check memory use, correctness on malformed input, and whether the port works on your target platforms.

<!-- you -->

