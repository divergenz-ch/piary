Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01YVtUyVFuQLFPevwzen2gSk -->

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
      "label": "simdjson-port vs v1, 100 KB",
      "value": 6.6,
      "unit": "x faster"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "simdjson-port vs v1, 10 MB",
      "value": 7.7,
      "unit": "x faster"
    },
    {
      "id": "c1",
      "component": "Callout",
      "tone": "info",
      "title": "Other points",
      "text": "v2 is about 2x faster than v1 at every size. serde-wasm is only slightly ahead of v2 on large inputs (402 vs 450 ms at 10 MB) and slightly behind at 1 KB."
    },
    {
      "id": "c2",
      "component": "Callout",
      "tone": "warning",
      "title": "Caveats",
      "text": "Medians hide variance, and memory use and bundle size are not measured. At 1 KB the gaps are tens of microseconds, so they likely don't matter. Per-byte throughput is flat above 100 KB (about 85 MB/s for simdjson-port at 10 MB), so check the inputs you actually parse."
    }
  ]
}
```

<!-- pi:result #toolu_01YVtUyVFuQLFPevwzen2gSk -->

```
ok
```

<!-- pi:thinking -->

I'm checking the throughput numbers: 10MB over 118ms comes to about 84.7MB/s, which holds up. The "flat above 100KB" claim also seems fine, since 100KB in 1.2ms works out to roughly 83MB/s.

<!-- pi -->

I'd pick simdjson-port. It's fastest at every size, and its lead over v1 grows from about 2.7x at 1 KB to about 7.7x at 10 MB.

- **v2 vs v1:** v2 is about 2x faster than v1 at every size, so it's a clear improvement.
- **serde-wasm vs v2:** serde-wasm barely beats v2 on large inputs and is slightly slower at 1 KB. It's only worth keeping if you need something else it offers.
- **Small inputs:** at 1 KB the differences are tens of microseconds, so they probably won't matter in practice.

The table gives only medians. It doesn't cover variance, memory use or bundle size, so check those before switching.

<!-- you -->

