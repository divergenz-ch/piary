Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_012Z2gXnhvUymPiFUvN5qVRT -->

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
      "y": "speedup",
      "series": "version",
      "layout": "group",
      "yScale": "log",
      "unit": "×",
      "title": "Speedup vs v1 (higher is better)",
      "data": [
        {
          "size": "1 KB",
          "version": "v2",
          "speedup": 1.6
        },
        {
          "size": "1 KB",
          "version": "simdjson-port",
          "speedup": 2.7
        },
        {
          "size": "1 KB",
          "version": "serde-wasm",
          "speedup": 1.3
        },
        {
          "size": "100 KB",
          "version": "v2",
          "speedup": 1.9
        },
        {
          "size": "100 KB",
          "version": "simdjson-port",
          "speedup": 6.6
        },
        {
          "size": "100 KB",
          "version": "serde-wasm",
          "speedup": 2.1
        },
        {
          "size": "10 MB",
          "version": "v2",
          "speedup": 2
        },
        {
          "size": "10 MB",
          "version": "simdjson-port",
          "speedup": 7.7
        },
        {
          "size": "10 MB",
          "version": "serde-wasm",
          "speedup": 2.3
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
      "label": "simdjson-port vs v1, 10 MB",
      "value": 7.7,
      "unit": "×"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "simdjson-port vs v2, 10 MB",
      "value": 3.8,
      "unit": "×"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "v2 vs serde-wasm, 10 MB",
      "value": 0.89,
      "unit": "×",
      "note": "serde-wasm is ~12% faster"
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "info",
      "title": "Caveats",
      "text": "Gains at 1 KB are tiny in absolute terms (0.05 ms). v2 and serde-wasm are roughly equal. Check variance, memory use, and bundle size before deciding; medians alone hide them."
    }
  ]
}
```

<!-- pi:result #toolu_012Z2gXnhvUymPiFUvN5qVRT -->

```
ok
```

<!-- pi -->

Takeaways:

- **simdjson-port wins at every size.** Its speedup over v1 grows from about 2.7× at 1 KB to about 7.7× at 10 MB, so it matters most for large payloads.
- **v2 is only about 2× faster than v1.** That's a steady gain, but it flattens out at larger sizes.
- **serde-wasm is slightly ahead of v2 on mid and large inputs.** It's about 7% faster at 100 KB and 11% at 10 MB. At 1 KB it's slightly slower (0.06 vs 0.05 ms).
- **Small inputs barely matter.** The differences at 1 KB are tens of microseconds, so call overhead will probably swamp them.

If your workloads are mostly large, adopt simdjson-port. Before committing, check its memory use, its correctness on edge cases, and any portability or build costs. These benchmarks are medians only, so they don't show variance.

<!-- you -->

