I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01RzZxq35mFwp77cXx4xUdhz -->

```json
{
  "dataModel": {
    "start": 1000,
    "monthly": 50,
    "rate": 7,
    "years": 30
  },
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "kpis",
        "startIn",
        "monthlyIn",
        "rateIn",
        "yearsIn",
        "growth",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Compound interest: money that makes money\nMove the sliders. Compare the **grey line** (just saving, no interest) with the **growth line**."
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "put",
        "end",
        "earned"
      ]
    },
    {
      "id": "put",
      "component": "Stat",
      "label": "You put in",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "start + monthly * 12 * years",
          "vars": {
            "start": {
              "@path": "/start"
            },
            "monthly": {
              "@path": "/monthly"
            },
            "years": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "end",
      "component": "Stat",
      "label": "You end up with",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(start * pow(1 + r/1200, 12*years) + if(r == 0, monthly*12*years, monthly * (pow(1 + r/1200, 12*years) - 1) / (r/1200)))",
          "vars": {
            "start": {
              "@path": "/start"
            },
            "monthly": {
              "@path": "/monthly"
            },
            "years": {
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
      "id": "earned",
      "component": "Stat",
      "label": "Free money from interest",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(start * pow(1 + r/1200, 12*years) + if(r == 0, monthly*12*years, monthly * (pow(1 + r/1200, 12*years) - 1) / (r/1200))) - start - monthly*12*years",
          "vars": {
            "start": {
              "@path": "/start"
            },
            "monthly": {
              "@path": "/monthly"
            },
            "years": {
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
      "id": "startIn",
      "component": "Slider",
      "label": "Starting money ($)",
      "min": 0,
      "max": 10000,
      "value": {
        "@path": "/start"
      }
    },
    {
      "id": "monthlyIn",
      "component": "Slider",
      "label": "Saved each month ($)",
      "min": 0,
      "max": 500,
      "value": {
        "@path": "/monthly"
      }
    },
    {
      "id": "rateIn",
      "component": "Slider",
      "label": "Interest per year (%)",
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
      "id": "growth",
      "component": "Chart",
      "mark": "line",
      "x": "year",
      "y": [
        "withInterest",
        "noInterest"
      ],
      "unit": "$",
      "xLabel": "Years",
      "labels": {
        "withInterest": "With interest",
        "noInterest": "Just saving (no interest)"
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
            "withInterest": "round(start * pow(1 + r/1200, 12*year) + if(r == 0, monthly*12*year, monthly * (pow(1 + r/1200, 12*year) - 1) / (r/1200)))",
            "noInterest": "start + monthly*12*year"
          },
          "vars": {
            "start": {
              "@path": "/start"
            },
            "monthly": {
              "@path": "/monthly"
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
      "text": "Set years to 10, then 40. Most of the growth comes at the end, because interest earns interest. Starting early beats saving more."
    }
  ]
}
```

<!-- pi:result #toolu_01RzZxq35mFwp77cXx4xUdhz -->

```
ok
```

<!-- pi -->

I've built an interactive compound interest calculator for your class. It has sliders for starting money, monthly savings, yearly interest rate and years.

A chart plots the balance with interest against plain saving with no interest. Three figures sit above it: what they put in, what they end up with, and how much came from interest. Interest is added monthly.

I haven't opened it to check it renders or that the numbers are right.

A good exercise is to set the years to 10, then 40. The gap between the two lines grows slowly at first and then quickly, which shows interest earning interest. A callout under the chart suggests this to the students.

<!-- you -->

