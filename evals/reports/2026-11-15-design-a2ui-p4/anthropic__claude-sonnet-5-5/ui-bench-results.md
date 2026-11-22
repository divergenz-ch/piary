Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01NUWqrr1Mf6WBkwxB3s92f3 -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "chart",
        "k",
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
      "id": "k",
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
      "label": "serde-wasm vs v2, 10 MB",
      "value": 1.1,
      "unit": "×"
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "info",
      "title": "Takeaways",
      "text": "1) simdjson-port is fastest throughout: 2.7× over v1 at 1 KB, ~7.7× at 10 MB, so its advantage compounds with size (SIMD pays off on bulk scanning; fixed overhead dominates at 1 KB). 2) v2 is a steady ~2× over v1, with no size-dependent gain. 3) serde-wasm is only ~5–10% faster than v2 at large sizes, and is slower than v2's 1 KB result by a hair (0.06 vs 0.05), so it isn't worth a switch. 4) Caveats: these are medians only, so there is no variance, memory, or correctness/feature data (validation, error handling, portability of the SIMD port). Absolute 1 KB gaps (0.02–0.05 ms) are near timer noise. Check those before committing."
    }
  ]
}
```

<!-- pi:result #toolu_01NUWqrr1Mf6WBkwxB3s92f3 -->

```
ok
```

<!-- pi -->

I'd take away three things.

- **simdjson-port wins at every size.** Its lead grows with input size: 2.7× faster than v1 at 1 KB, and 7.7× at 10 MB. At 10 MB it is also 3.8× faster than v2.
- **v2 is a steady improvement over v1.** It is about 2× faster at every size.
- **serde-wasm is not worth switching to.** At 100 KB and 10 MB it is only about 5–10% faster than v2. At 1 KB it is slightly slower (0.06 ms against 0.05 ms).

These are medians only, so there is no variance, memory or correctness data. The 1 KB differences are tiny (0.02–0.05 ms) and may be timer noise. Before committing to simdjson-port, check that it validates input and reports errors the same way, and that it runs on all your target platforms.

<!-- you -->

