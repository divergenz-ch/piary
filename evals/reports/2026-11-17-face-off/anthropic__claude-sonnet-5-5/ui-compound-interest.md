I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01RNZXPPaSQ72zszQtabkj8M -->

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
        "controls",
        "kpis",
        "growth",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Watch your money grow on itself"
    },
    {
      "id": "intro",
      "component": "Text",
      "text": "Drag the sliders. Compare the **straight line** (simple interest: you earn on your original money only) with the **curve** (compound interest: you also earn on past interest).",
      "variant": "body"
    },
    {
      "id": "controls",
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
      "min": 100,
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
      "max": 60,
      "value": {
        "@path": "/years"
      }
    },
    {
      "id": "s4",
      "component": "Slider",
      "label": "Extra you add each year ($)",
      "min": 0,
      "max": 2000,
      "steps": 50,
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
      "label": "Compound: final amount",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r/100)^y + if(r > 0, a * ((1 + r/100)^y - 1) / (r/100), a * y))",
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
      "label": "Simple: final amount",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r/100*y) + a*y)",
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
      "label": "Bonus from compounding",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * ((1 + r/100)^y - 1 - r/100*y) + if(r > 0, a * ((1 + r/100)^y - 1) / (r/100), a * y) - a*y)",
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
      "id": "growth",
      "component": "Chart",
      "mark": "line",
      "x": "year",
      "y": [
        "compound",
        "simple"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Balance",
      "labels": {
        "compound": "Compound interest",
        "simple": "Simple interest"
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
            "compound": "round(s * (1 + r/100)^year + if(r > 0, a * ((1 + r/100)^year - 1) / (r/100), a * year))",
            "simple": "round(s * (1 + r/100*year) + a*year)"
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
      "text": "Set extra savings to 0 and push years to 60. Then lower the years to 10. Why does the gap only explode late? Interest earns interest."
    }
  ]
}
```

<!-- pi:result #toolu_01RNZXPPaSQ72zszQtabkj8M -->

```
ok
```

<!-- pi -->

I built an interactive explainer in the page. It has sliders for starting money, interest rate, years, and yearly extra savings.

It compares compound interest (the curve) with simple interest (the straight line) and shows the final amounts and the "bonus from compounding" as numbers. There's a "Try this" prompt at the bottom to start a class discussion. I haven't checked the figures or the chart.

A suggestion for class: have students guess the final amount at 30 years before moving the years slider, then see how far off they were.

<!-- you -->

