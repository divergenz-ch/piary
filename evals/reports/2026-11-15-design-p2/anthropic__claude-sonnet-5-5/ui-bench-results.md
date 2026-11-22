Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01V4oJtWqPV6M7HKaipJMoVn -->

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
        "note"
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
      "x": "size",
      "y": "speedup",
      "series": "impl",
      "layout": "group",
      "unit": "×",
      "title": "Speedup vs v1 (higher is faster)",
      "data": [
        {
          "size": "1 KB",
          "impl": "v2",
          "speedup": 1.6
        },
        {
          "size": "1 KB",
          "impl": "simdjson-port",
          "speedup": 2.7
        },
        {
          "size": "1 KB",
          "impl": "serde-wasm",
          "speedup": 1.3
        },
        {
          "size": "100 KB",
          "impl": "v2",
          "speedup": 1.9
        },
        {
          "size": "100 KB",
          "impl": "simdjson-port",
          "speedup": 6.6
        },
        {
          "size": "100 KB",
          "impl": "serde-wasm",
          "speedup": 2.1
        },
        {
          "size": "10 MB",
          "impl": "v2",
          "speedup": 2
        },
        {
          "size": "10 MB",
          "impl": "simdjson-port",
          "speedup": 7.7
        },
        {
          "size": "10 MB",
          "impl": "serde-wasm",
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
      "label": "simdjson-port vs serde-wasm, 10 MB",
      "value": 3.4,
      "unit": "×"
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "info",
      "title": "Takeaways",
      "text": "v2 is a steady ~2× over v1. serde-wasm is only slightly ahead of v2 and beats it just at 100 KB+. At 1 KB, differences are microseconds, likely noise or overhead. Check memory, binary size and correctness before choosing."
    }
  ]
}
```

<!-- pi:result #toolu_01V4oJtWqPV6M7HKaipJMoVn -->

```
ok
```

<!-- pi -->

**Main takeaway:** simdjson-port is fastest at every size. Its advantage grows with input: about 2.7× faster than v1 at 1 KB, 6.6× at 100 KB and 7.7× at 10 MB.

- **v2 vs v1:** v2 is a steady improvement of about 1.6–2×.
- **serde-wasm vs v2:** serde-wasm is only marginally faster than v2, and it is slower at 1 KB. It isn't a meaningful step up.
- **1 KB results:** the differences are tens of microseconds, so fixed overhead and noise probably dominate. Don't read much into the ranking there.
- **Caveats:** these are medians only. Before you commit to simdjson-port, check variance (p95), memory use, binary size and correctness on edge cases. Also check whether your real payloads are closer to 1 KB or 10 MB, since the gap matters most for large inputs.

<!-- you -->

