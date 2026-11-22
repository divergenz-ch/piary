Benchmark results, median ms, for our JSON parser at three input sizes. 1 KB: v1 0.08, v2 0.05, simdjson-port 0.03, serde-wasm 0.06. 100 KB: v1 7.9, v2 4.1, simdjson-port 1.2, serde-wasm 3.8. 10 MB: v1 910, v2 450, simdjson-port 118, serde-wasm 402. What should I take away from this?

<!-- pi:view a2ui #toolu_01MZukYSeo1aFLAnGzfCtek1 -->

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
      "text": "## simdjson-port wins at every size, and its lead grows with input"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "bar",
      "layout": "group",
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
      "caption": "Speedup of simdjson-port over each other version",
      "rows": [
        {
          "size": "1 KB",
          "v2": "1.7x",
          "serde-wasm": "2.0x"
        },
        {
          "size": "100 KB",
          "v2": "3.4x",
          "serde-wasm": "3.2x"
        },
        {
          "size": "10 MB",
          "v2": "3.8x",
          "serde-wasm": "3.4x"
        }
      ]
    },
    {
      "id": "n",
      "component": "Callout",
      "tone": "info",
      "title": "Takeaways",
      "text": "Ship simdjson-port for anything beyond tiny inputs. v2 and serde-wasm are about equal (~2x over v1). At 1 KB, differences are microseconds, so check memory, binary size and correctness before switching."
    }
  ]
}
```

<!-- pi:result #toolu_01MZukYSeo1aFLAnGzfCtek1 -->

```
ok
```

<!-- pi -->

I've charted the results above. The main points:

- **simdjson-port is fastest at every size.** Its lead over v1 grows from about 2.7x at 1 KB to about 7.7x at 10 MB. It scales better with input size, so use it for large payloads.
- **v2 and serde-wasm are about the same.** Both are roughly 2x faster than v1 at 100 KB and 10 MB. serde-wasm is slightly ahead of v2 at those sizes and slightly behind at 1 KB.
- **At 1 KB the differences are tiny.** They are a few hundredths of a millisecond. At that size, call overhead, memory use and binary size probably matter more than parse speed.
- **Caveat:** these are medians only. Check variance, memory use and correctness on malformed input before you switch.

<!-- you -->

