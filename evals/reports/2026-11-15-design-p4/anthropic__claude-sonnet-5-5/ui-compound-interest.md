I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01SGy6GsfNeUXqhpNNVYeAbr -->

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
        "inputs",
        "kpis",
        "chart",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Compound interest playground\nMove the sliders. Watch the orange gap between simple and compound grow."
    },
    {
      "id": "inputs",
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
      "steps": 100,
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
      "label": "Years",
      "min": 1,
      "max": 50,
      "value": {
        "@path": "/years"
      }
    },
    {
      "id": "s4",
      "component": "Slider",
      "label": "Extra you add each year ($)",
      "min": 0,
      "max": 5000,
      "steps": 100,
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
      "label": "Compound (interest on interest)",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(if(r == 0, s + a * y, s * (1 + r / 100) ^ y + a * (((1 + r / 100) ^ y - 1) / (r / 100))))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "r": {
              "@path": "/rate"
            },
            "y": {
              "@path": "/years"
            },
            "a": {
              "@path": "/add"
            }
          }
        }
      }
    },
    {
      "id": "k2",
      "component": "Stat",
      "label": "Simple (interest only on your money)",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s + a * y + (s * y + a * y * (y - 1) / 2) * r / 100)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "r": {
              "@path": "/rate"
            },
            "y": {
              "@path": "/years"
            },
            "a": {
              "@path": "/add"
            }
          }
        }
      }
    },
    {
      "id": "k3",
      "component": "Stat",
      "label": "Total you put in",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "s + a * y",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "y": {
              "@path": "/years"
            },
            "a": {
              "@path": "/add"
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
        "simple",
        "deposited"
      ],
      "unit": "$",
      "xLabel": "Years",
      "labels": {
        "compound": "Compound",
        "simple": "Simple interest",
        "deposited": "Money you put in"
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
            "compound": "round(if(r == 0, s + a * year, s * (1 + r / 100) ^ year + a * (((1 + r / 100) ^ year - 1) / (r / 100))))",
            "simple": "round(s + a * year + (s * year + a * year * (year - 1) / 2) * r / 100)",
            "deposited": "s + a * year"
          },
          "vars": {
            "s": {
              "@path": "/start"
            },
            "r": {
              "@path": "/rate"
            },
            "a": {
              "@path": "/add"
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
      "text": "Set extra savings to 0 and rate to 7%. Compare 10 vs 40 years. Then keep 40 years and change the rate to 3%. Time matters more than you'd guess."
    }
  ]
}
```

<!-- pi:result #toolu_01SGy6GsfNeUXqhpNNVYeAbr -->

```
ok
```

<!-- pi -->

I built a compound interest playground with four sliders: starting money, yearly interest rate, number of years, and extra money added each year.

It compares three amounts side by side: compound interest, simple interest, and the total the student put in. The chart shows all three over time, so students can see the gap between compound and simple widen as the years pass.

I haven't checked the formulas against hand calculations.

A good in-class exercise is already in the page: compare 10 and 40 years at 7%, then drop the rate to 3%.

<!-- you -->

