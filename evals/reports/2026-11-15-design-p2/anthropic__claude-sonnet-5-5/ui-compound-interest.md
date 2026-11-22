I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_014H7cMyspqSUfm4pxUSehqv -->

```json
{
  "dataModel": {
    "start": 1000,
    "rate": 7,
    "years": 30
  },
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "inputs",
        "kpis",
        "chart",
        "callout"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Compound interest: money that makes money"
    },
    {
      "id": "inputs",
      "component": "Column",
      "children": [
        "s1",
        "s2",
        "s3"
      ]
    },
    {
      "id": "s1",
      "component": "Slider",
      "label": "Starting money ($)",
      "min": 100,
      "max": 10000,
      "steps": 99,
      "value": {
        "@path": "/start"
      }
    },
    {
      "id": "s2",
      "component": "Slider",
      "label": "Interest rate (% per year)",
      "min": 0,
      "max": 15,
      "steps": 30,
      "value": {
        "@path": "/rate"
      }
    },
    {
      "id": "s3",
      "component": "Slider",
      "label": "Years",
      "min": 1,
      "max": 50,
      "steps": 49,
      "value": {
        "@path": "/years"
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
      "label": "Simple interest (no snowball)",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r / 100 * y))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "r": {
              "@path": "/rate"
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
      "label": "Compound interest",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r / 100) ^ y)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "r": {
              "@path": "/rate"
            },
            "y": {
              "@path": "/years"
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
          "expr": "round(s * ((1 + r / 100) ^ y - 1 - r / 100 * y))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "r": {
              "@path": "/rate"
            },
            "y": {
              "@path": "/years"
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
        "simple",
        "compound"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Money",
      "labels": {
        "simple": "Simple interest",
        "compound": "Compound interest"
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
            "simple": "round(s * (1 + r / 100 * year))",
            "compound": "round(s * (1 + r / 100) ^ year)"
          },
          "vars": {
            "s": {
              "@path": "/start"
            },
            "r": {
              "@path": "/rate"
            }
          }
        }
      }
    },
    {
      "id": "callout",
      "component": "Callout",
      "tone": "info",
      "title": "Try this",
      "text": "Set rate to 7% and years to 10, then 30, then 50. The gap isn't linear, it explodes. Then try 2% vs 10%: which matters more, rate or time?"
    }
  ]
}
```

<!-- pi:result #toolu_014H7cMyspqSUfm4pxUSehqv -->

```
ok
```

<!-- pi -->

I've made an interactive explainer with three sliders: starting money, interest rate and years. It compares simple interest (grows in a straight line) with compound interest (interest earns interest), as two lines on a chart with three headline numbers. The "Try this" box gives the class a first experiment.

I haven't looked at the rendered page, so check it loads before class.

<!-- you -->

