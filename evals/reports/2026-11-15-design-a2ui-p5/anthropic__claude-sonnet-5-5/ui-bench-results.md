Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01ARQWHyoHAzSa21HEG1bxL1 -->

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
        "t",
        "n"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## simdjson-port wins at every size, and its lead grows"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "line",
      "x": "size",
      "y": [
        "v1",
        "v2",
        "simdjson-port",
        "serde-wasm"
      ],
      "yScale": "log",
      "unit": "ms",
      "title": "Median parse time (log scale)",
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
      "id": "t",
      "component": "Table",
      "caption": "Speedup over v1",
      "rows": [
        {
          "impl": "v2",
          "1 KB": "1.6x",
          "100 KB": "1.9x",
          "10 MB": "2.0x"
        },
        {
          "impl": "simdjson-port",
          "1 KB": "2.7x",
          "100 KB": "6.6x",
          "10 MB": "7.7x"
        },
        {
          "impl": "serde-wasm",
          "1 KB": "1.3x",
          "100 KB": "2.1x",
          "10 MB": "2.3x"
        }
      ]
    },
    {
      "id": "n",
      "component": "Callout",
      "tone": "info",
      "title": "Takeaways",
      "text": "v2 and serde-wasm are nearly equal (about 2x v1) and scale linearly. simdjson-port pulls ahead as inputs grow (~3.8x faster than v2 at 10 MB). At 1 KB differences are tens of microseconds, so likely irrelevant. Single medians only: check variance, memory use, and correctness or portability before switching."
    }
  ]
}
```

<!-- pi:result #toolu_01ARQWHyoHAzSa21HEG1bxL1 -->

```
ok
```

<!-- pi -->

I've charted the results and put the takeaways in the view above. In short, simdjson-port is fastest at every size, and its lead over the others grows with input size.

- **Scaling:** simdjson-port is about 2.7x faster than v1 at 1 KB, 6.6x at 100 KB and 7.7x at 10 MB.
- **v2 and serde-wasm:** these two are close to each other and about 2x faster than v1. They scale roughly linearly, like v1.
- **Small inputs:** at 1 KB the gaps are only tens of microseconds, so they probably don't matter in practice.

These are single medians, so I can't see variance. Before switching, I'd also check memory use, correctness on edge cases, and portability.

<!-- you -->

