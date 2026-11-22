Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:thinking -->

I'm deciding whether to read the skill file first; I'll skip it and go straight to using the a2ui view, since its description is enough. Next I'm working out the speedups against v1 at 1KB, 100KB, and 10MB for v2, simd, and serde.

I'm working out the throughput numbers now: simd comes to about 85 MB/s at 10MB, against roughly 11 MB/s for v1, and the 1KB case is lower because of fixed overhead. Scaling from 100KB to 10MB looks close to linear across the versions, with v1 scaling most closely to the 100x size increase.

<!-- pi:view a2ui #toolu_0159VVuYQJcqiCr9tqW9pRTE -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "c",
        "k",
        "t"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## simdjson-port wins, and its lead grows with input size"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "bar",
      "layout": "group",
      "x": "size",
      "y": [
        "v2",
        "simdjson-port",
        "serde-wasm"
      ],
      "unit": "×",
      "yLabel": "Speedup vs v1",
      "data": [
        {
          "size": "1 KB",
          "v2": 1.6,
          "simdjson-port": 2.7,
          "serde-wasm": 1.3
        },
        {
          "size": "100 KB",
          "v2": 1.9,
          "simdjson-port": 6.6,
          "serde-wasm": 2.1
        },
        {
          "size": "10 MB",
          "v2": 2,
          "simdjson-port": 7.7,
          "serde-wasm": 2.3
        }
      ]
    },
    {
      "id": "k",
      "component": "Row",
      "children": [
        "s1",
        "s2"
      ]
    },
    {
      "id": "s1",
      "component": "Stat",
      "label": "simdjson-port at 10 MB",
      "value": 7.7,
      "unit": "× faster than v1",
      "note": "118 ms vs 910 ms (~85 MB/s vs ~11 MB/s)"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "v2 at 10 MB",
      "value": 2,
      "unit": "× faster than v1",
      "note": "serde-wasm ≈ v2 (2.3×)"
    },
    {
      "id": "t",
      "component": "Callout",
      "tone": "info",
      "title": "Takeaways",
      "text": "v2 and serde-wasm are about 2× v1 and nearly tied. simdjson-port is ~4× better than either at 100 KB+. At 1 KB all differences are tens of microseconds, so fixed overhead dominates. All scale roughly linearly with size. Check memory use, binary size and correctness before switching."
    }
  ]
}
```

<!-- pi:result #toolu_0159VVuYQJcqiCr9tqW9pRTE -->

```
ok
```

<!-- pi -->

Take simdjson-port as the fastest at every size. Its lead grows with input size, from 2.7× over v1 at 1 KB to 7.7× at 10 MB.

Caveats:
- **Only the throughput numbers are measured.** The ~85 MB/s and ~11 MB/s figures are derived from your medians.
- **Small inputs don't separate the options.** At 1 KB the gaps are tens of microseconds, so fixed overhead dominates and the choice barely matters.
- **These are medians only.** Check tail latency and variance too.
- **Speed isn't the whole decision.** Compare memory use, binary size and correctness before switching.

<!-- you -->

