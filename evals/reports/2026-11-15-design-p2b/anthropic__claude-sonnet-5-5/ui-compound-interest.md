I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01EMrJucnHRrNSwZRqNro6PF -->

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
      "text": "## Compound interest: watch money grow on itself"
    },
    {
      "id": "intro",
      "component": "Text",
      "text": "Drag the sliders. Compare the **grey straight line** (simple interest: only your original money earns) with the **curve** (compound: interest earns interest too)."
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
          "expr": "round(if(r==0, s + a*y, s*(1+r/100)^y + a*((1+r/100)^y-1)/(r/100)))",
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
      "label": "Simple interest: final amount",
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
      "label": "Bonus from compounding",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(if(r==0,0,s*(1+r/100)^y + a*((1+r/100)^y-1)/(r/100)) - (s*(1+r/100*y) + a*y + a*r/100*y*(y-1)/2))",
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
        "simple",
        "deposited"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Balance",
      "labels": {
        "compound": "Compound",
        "simple": "Simple interest",
        "deposited": "Only what you put in"
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
            "compound": "round(if(r==0, s + a*year, s*(1+r/100)^year + a*((1+r/100)^year-1)/(r/100)))",
            "simple": "round(s*(1+r/100*year) + a*year + a*r/100*year*(year-1)/2)",
            "deposited": "s + a*year"
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
      "text": "Set years to 10, then 30, then 50 at 7%. The gap explodes late. Then keep 30 years and change the rate 4% → 10%."
    }
  ]
}
```

<!-- pi:result #toolu_01EMrJucnHRrNSwZRqNro6PF -->

```
ok
```

<!-- pi -->

I built an interactive explorer with sliders for starting money, interest rate, years and yearly deposits. It compares compound interest, simple interest, and the money you put in yourself, with a "Try this" prompt at the bottom. I haven't opened it in the page, so I haven't checked how it renders.

For class, you could ask students to guess the 30-year total before they move the sliders. You could also have them find how many years it takes to double their money at 7%.

<!-- you -->

