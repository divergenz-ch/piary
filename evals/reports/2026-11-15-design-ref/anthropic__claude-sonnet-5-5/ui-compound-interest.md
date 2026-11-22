I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01CXdqjChx1LgyfBgV3jBiz9 -->

```json
{
  "dataModel": {
    "start": 1000,
    "rate": 7,
    "years": 30,
    "add": 50
  },
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "intro",
        "startIn",
        "addIn",
        "rateIn",
        "yearsIn",
        "kpis",
        "chart",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Compound interest: your money makes money"
    },
    {
      "id": "intro",
      "component": "Text",
      "text": "Drag the sliders. Compare **simple interest** (only your original money earns) with **compound interest** (earnings earn too). Try 40 years!"
    },
    {
      "id": "startIn",
      "component": "Slider",
      "label": "Money you start with ($)",
      "min": 0,
      "max": 10000,
      "value": {
        "@path": "/start"
      }
    },
    {
      "id": "addIn",
      "component": "Slider",
      "label": "Added every year ($)",
      "min": 0,
      "max": 2000,
      "value": {
        "@path": "/add"
      }
    },
    {
      "id": "rateIn",
      "component": "Slider",
      "label": "Interest rate, % a year",
      "min": 0,
      "max": 15,
      "value": {
        "@path": "/rate"
      }
    },
    {
      "id": "yearsIn",
      "component": "Slider",
      "label": "Years",
      "min": 1,
      "max": 50,
      "value": {
        "@path": "/years"
      }
    },
    {
      "id": "kpis",
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
      "label": "You put in",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "s + a * n",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "n": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Simple interest total",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s + a * n + (s + a * (n - 1) / 2) * r / 100 * n)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "n": {
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
      "id": "s3",
      "component": "Stat",
      "label": "Compound total",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(if(r == 0, s + a * n, s * (1 + r / 100) ^ n + a * ((1 + r / 100) ^ n - 1) / (r / 100)))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "n": {
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
        "deposits"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Balance",
      "labels": {
        "compound": "With compound interest",
        "deposits": "Just what you put in"
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
            "compound": "round(if(r == 0, s + a * year, s * (1 + r / 100) ^ year + a * ((1 + r / 100) ^ year - 1) / (r / 100)))",
            "deposits": "s + a * year"
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
      "title": "Why it curves",
      "text": "Each year's interest is added to the pile, so next year you earn interest on a bigger pile. The gap between the lines is free money."
    }
  ]
}
```

<!-- pi:result #toolu_01CXdqjChx1LgyfBgV3jBiz9 -->

```
ok
```

<!-- pi -->

I built an interactive explainer with four sliders: starting money, yearly additions, interest rate and years.

It shows three totals: what you put in, the total with simple interest, and the total with compound interest. A chart plots the compound balance against the deposits alone. The gap between the two lines is the interest.

For a class activity, try these:
- Set the years to 10, then 30, then 50, and watch the curve bend upward.
- Set the rate to 0%, and the gap disappears.
- Keep the rate the same and compare starting at 16 with starting at 26.

I haven't checked the totals against a hand calculation or looked at how it renders on screen.

<!-- you -->

