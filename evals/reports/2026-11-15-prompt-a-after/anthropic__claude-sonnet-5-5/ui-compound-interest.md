I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_017iZvLWz7QDMCX275gdVxP8 -->

```json
{
  "dataModel": {
    "start": 1000,
    "rate": 7,
    "years": 30,
    "add": 0
  },
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "intro",
        "ctl",
        "kpis",
        "chart",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Compound interest: watch money grow on money"
    },
    {
      "id": "intro",
      "component": "Text",
      "text": "Drag the sliders. The orange-ish gap between the two lines is the *bonus* you get from compounding: interest earning its own interest.",
      "variant": "caption"
    },
    {
      "id": "ctl",
      "component": "Column",
      "children": [
        "s1",
        "s2",
        "s3",
        "s4"
      ]
    },
    {
      "id": "s1",
      "component": "Slider",
      "label": "Money you start with ($)",
      "min": 0,
      "max": 10000,
      "value": {
        "@path": "/start"
      }
    },
    {
      "id": "s2",
      "component": "Slider",
      "label": "Interest per year (%)",
      "min": 0,
      "max": 15,
      "value": {
        "@path": "/rate"
      }
    },
    {
      "id": "s3",
      "component": "Slider",
      "label": "Years you leave it",
      "min": 1,
      "max": 50,
      "value": {
        "@path": "/years"
      }
    },
    {
      "id": "s4",
      "component": "Slider",
      "label": "Add each year ($)",
      "min": 0,
      "max": 5000,
      "value": {
        "@path": "/add"
      }
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "k1",
        "k2",
        "k3"
      ]
    },
    {
      "id": "k1",
      "component": "Stat",
      "label": "You put in",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s + a * y)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "y": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "k2",
      "component": "Stat",
      "label": "Total at the end (compound)",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r/100) ^ y + if(r == 0, a * y, a * ((1 + r/100) ^ y - 1) / (r/100)))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "y": {
              "@path": "/years"
            },
            "r": {
              "@path": "/rate"
            }
          }
        }
      }
    },
    {
      "id": "k3",
      "component": "Stat",
      "label": "Bonus from compounding",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r/100) ^ y + if(r == 0, a * y, a * ((1 + r/100) ^ y - 1) / (r/100)) - (s + a * y) - (s * r/100 * y + if(r == 0, 0, a * r/100 * y * (y - 1) / 2)))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "y": {
              "@path": "/years"
            },
            "r": {
              "@path": "/rate"
            }
          }
        }
      }
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "line",
      "x": "year",
      "y": [
        "compound",
        "simple"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Money",
      "labels": {
        "compound": "Compound (interest on interest)",
        "simple": "Simple (interest on your original only)"
      },
      "data": {
        "@call": "series",
        "args": {
          "from": 0,
          "to": {
            "@path": "/years"
          },
          "index": "year",
          "columns": {
            "compound": "round(s * (1 + r/100) ^ year + if(r == 0, a * year, a * ((1 + r/100) ^ year - 1) / (r/100)))",
            "simple": "round(s + a * year + s * r/100 * year + a * r/100 * year * (year - 1) / 2)"
          },
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "r": {
              "@path": "/rate"
            }
          }
        }
      }
    },
    {
      "id": "why",
      "component": "Callout",
      "tone": "info",
      "title": "Try this",
      "text": "Set interest to 7% and add nothing. Compare 10 years vs 40 years. Time matters more than the starting amount."
    }
  ]
}
```

<!-- pi:result #toolu_017iZvLWz7QDMCX275gdVxP8 -->

```
ok
```

<!-- pi -->

I built an interactive compound interest explorer for your class. I haven't looked at the rendered page or checked its numbers, so run it once before class.

Students set four sliders: starting money, yearly interest, years, and a yearly top-up. A chart compares compound growth with simple interest, which pays only on the original amount. The stat tiles show how much they put in, the final total, and the bonus from compounding.

The intro line calls the gap between the lines "orange-ish", but I didn't set the line colours. Change that wording if the lines aren't orange.

The Try this prompt asks them to compare 10 and 40 years at 7%. Time matters more than the starting amount, so the longer run should look much bigger.

<!-- you -->

