I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01HxHcMwiZZHmChjfHzpVm8h -->

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
        "chart",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Watch money grow on itself"
    },
    {
      "id": "intro",
      "component": "Text",
      "text": "Drag the sliders. Compare the **straight line** (simple interest: same bonus every year) with the **curve** (compound: interest earns interest)."
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
      "value": {
        "@path": "/start"
      }
    },
    {
      "id": "s2",
      "component": "Slider",
      "label": "Interest per year (%)",
      "min": 0,
      "max": 20,
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
      "label": "Compound: you end with",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s*(1+r/100)^y + if(r==0, a*y, a*((1+r/100)^y-1)/(r/100)))",
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
      "label": "Simple interest: you end with",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s*(1+r/100*y) + a*y + a*r/100*y*(y-1)/2)",
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
      "label": "Extra from compounding",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s*(1+r/100)^y + if(r==0, a*y, a*((1+r/100)^y-1)/(r/100)) - s*(1+r/100*y) - a*y - a*r/100*y*(y-1)/2)",
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
        "compound": "Compound",
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
            "compound": "round(s*(1+r/100)^year + if(r==0, a*year, a*((1+r/100)^year-1)/(r/100)))",
            "simple": "round(s*(1+r/100*year) + a*year + a*r/100*year*(year-1)/2)"
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
      "text": "Set interest to 7% and years to 10, then slide years to 40. Time matters more than the rate. Then start at 0 and add $1,000 a year."
    }
  ]
}
```

<!-- pi:result #toolu_01HxHcMwiZZHmChjfHzpVm8h -->

```
ok
```

<!-- pi -->

I built an interactive page above that your students can use in class. It has sliders for starting money, interest rate, years, and an extra amount added each year.

It compares two lines. The straight line is simple interest, where the bonus is the same every year. The curve is compound interest, where interest also earns interest. Three figures show how much each ends up with and the gap between them. A "Try this" prompt at the bottom suggests a first experiment.

I haven't checked the output by hand. The simple-interest line also counts interest on the yearly extra deposits, so the gap it shows is only for compounding itself.

<!-- you -->

