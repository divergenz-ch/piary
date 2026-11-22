Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01ACmMdgZbvHwua6riymwEut -->

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
        "c"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## simdjson-port is fastest at every size, and its lead grows with input"
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "bar",
      "x": "size",
      "y": [
        "v1",
        "v2",
        "simdjson-port",
        "serde-wasm"
      ],
      "layout": "group",
      "yScale": "log",
      "unit": "ms",
      "title": "Median ms (log scale)",
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
      "id": "c",
      "component": "Callout",
      "tone": "info",
      "title": "Caveats",
      "text": "v2 is ~2x v1 everywhere, a solid but flat gain. serde-wasm is only marginally better than v2 (about 5–12%). At 1 KB, differences are microseconds, so they likely don't matter. Check memory, binary size and variance, since only medians were given."
    }
  ]
}
```

<!-- pi:result #toolu_01ACmMdgZbvHwua6riymwEut -->

```
ok
```

<!-- pi -->

**Takeaways**
- **simdjson-port wins at every size.** Its lead grows with input: 2.7x faster than v1 at 1 KB, 6.6x at 100 KB and 7.7x at 10 MB. It is about 3.4x faster than v2 at 100 KB and 3.8x at 10 MB.
- **v2 is a steady ~2x improvement over v1.** The gain is flat across sizes, so it doesn't change how the parser scales.
- **serde-wasm is only slightly faster than v2.** It is about 5–12% faster at 100 KB and 10 MB, and slower than v2 at 1 KB.
- **1 KB differences are negligible.** They are tens of nanoseconds. Only the larger sizes should drive your decision.

**Before deciding:** these are medians only. Check tail latency, memory use, binary size, and whether your real inputs look like these benchmarks. SIMD speedups often depend on the data's structure.

<!-- you -->

