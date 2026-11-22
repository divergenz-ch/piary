Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view table #toolu_01P2aTyQUcKG93bx2k67Ed4a -->

```json
{
  "columns": [
    "Size",
    "v1",
    "v2",
    "simdjson-port",
    "serde-wasm",
    "simdjson vs v2",
    "simdjson vs v1"
  ],
  "rows": [
    [
      "1 KB",
      0.08,
      0.05,
      0.03,
      0.06,
      "1.7× faster",
      "2.7× faster"
    ],
    [
      "100 KB",
      7.9,
      4.1,
      1.2,
      3.8,
      "3.4× faster",
      "6.6× faster"
    ],
    [
      "10 MB",
      910,
      450,
      118,
      402,
      "3.8× faster",
      "7.7× faster"
    ]
  ]
}
```

<!-- pi:result #toolu_01P2aTyQUcKG93bx2k67Ed4a -->

```
ok
```

<!-- pi -->

**Takeaways**

- **simdjson-port wins at every size.** Its lead grows with input: 1.7× over v2 at 1 KB, and about 3.4–3.8× at 100 KB and above. It's the one to adopt if large payloads matter.
- **v2 is about 2× faster than v1 at every size.** That gain is consistent, but it's modest next to simdjson-port.
- **serde-wasm is only slightly faster than v2 at 100 KB and above** (about 5–11%). At 1 KB it's slower than v2 (0.06 vs 0.05 ms). It doesn't look worth switching to unless you need WASM for other reasons.
- **Scaling is roughly linear for all four.** From 100 KB to 10 MB, the input grows 100× and time grows about 115×. Per-byte throughput is similar across sizes, so none of them has a pathological case.
- **At 1 KB the differences are tens of microseconds.** Fixed overhead probably dominates, and that's likely noise-level in real use. Don't pick an implementation on small-input numbers.

**Caveats**
- These are medians only. Check variance and tail latency (p95/p99), especially for the SIMD and WASM builds.
- I can't tell what hardware was used or whether it was a cold or warm run. SIMD gains depend heavily on CPU features such as AVX2 and NEON.
- Parse time isn't the whole cost. Check memory use and how each result is handed back. A port or WASM boundary can add costs that this benchmark misses.
- All of this is for one input shape. Parsing speed depends on the JSON's structure, such as number-heavy, string-heavy or deeply nested data, so test with your real payloads.

<!-- you -->

