I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01RhLN1UxxuzMpW7XjA1C1yQ -->

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
        "kpis",
        "startIn",
        "rateIn",
        "yearsIn",
        "addIn",
        "growth",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Compound interest: money that makes money"
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "s1",
        "s2",
        "s3",
        "s4"
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
          "expr": "start + add * years",
          "vars": {
            "start": {
              "@path": "/start"
            },
            "add": {
              "@path": "/add"
            },
            "years": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Simple interest (no snowball)",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(start + add * years + start * r / 100 * years + add * r / 100 * years * (years - 1) / 2)",
          "vars": {
            "start": {
              "@path": "/start"
            },
            "add": {
              "@path": "/add"
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
      "id": "s3",
      "component": "Stat",
      "label": "Compound interest",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(start * (1 + r / 100) ^ years + if(r > 0, add * ((1 + r / 100) ^ years - 1) / (r / 100), add * years))",
          "vars": {
            "start": {
              "@path": "/start"
            },
            "add": {
              "@path": "/add"
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
      "id": "s4",
      "component": "Stat",
      "label": "Years to double (rule of 72)",
      "unit": "yrs",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "if(r > 0, round(72 / r * 10) / 10, 0)",
          "vars": {
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
      "label": "Starting money, $",
      "min": 0,
      "max": 10000,
      "value": {
        "@path": "/start"
      }
    },
    {
      "id": "rateIn",
      "component": "Slider",
      "label": "Interest per year, %",
      "min": 0,
      "max": 20,
      "value": {
        "@path": "/rate"
      }
    },
    {
      "id": "yearsIn",
      "component": "Slider",
      "label": "Years",
      "min": 1,
      "max": 60,
      "value": {
        "@path": "/years"
      }
    },
    {
      "id": "addIn",
      "component": "Slider",
      "label": "Added each year, $",
      "min": 0,
      "max": 5000,
      "value": {
        "@path": "/add"
      }
    },
    {
      "id": "growth",
      "component": "Chart",
      "mark": "line",
      "x": "year",
      "y": [
        "compound",
        "simple",
        "deposits"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Money",
      "labels": {
        "compound": "Compound",
        "simple": "Simple interest",
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
            "compound": "round(start * (1 + r / 100) ^ year + if(r > 0, add * ((1 + r / 100) ^ year - 1) / (r / 100), add * year))",
            "simple": "round(start + add * year + start * r / 100 * year + add * r / 100 * year * (year - 1) / 2)",
            "deposits": "start + add * year"
          },
          "vars": {
            "start": {
              "@path": "/start"
            },
            "add": {
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
      "text": "Set added to 0, rate 7%, then drag Years from 10 to 40. The gap between the lines is interest earning interest. Then compare 3% vs 10%."
    }
  ]
}
```

<!-- pi:result #toolu_01RhLN1UxxuzMpW7XjA1C1yQ -->

```
ok
```

<!-- pi -->

I built an interactive compound interest explorer in the page. Students can drag four sliders: starting money, yearly interest rate, years, and amount added each year.

- **Chart:** it plots compound growth, simple interest, and just the money put in. The gap between compound and simple is the "interest earning interest" effect.
- **Numbers:** tiles above the chart show what the student put in, the simple-interest total, the compound total, and the years to double using the rule of 72.
- **Prompt:** a "Try this" box suggests a first experiment. Set added money to 0 and the rate to 7%, then drag Years from 10 to 40. After that, compare 3% with 10%.

I haven't opened it to check how it looks or tested the sliders.

<!-- you -->

