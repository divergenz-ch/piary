I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_0143o8xrc5StiVgugs9QfXe3 -->

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
        "startIn",
        "addIn",
        "rateIn",
        "yearsIn",
        "kpis",
        "chart",
        "callout"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Compound interest playground"
    },
    {
      "id": "intro",
      "component": "Text",
      "text": "Move the sliders. Watch how **interest earns interest**, so the growth curves upward instead of going in a straight line."
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
      "label": "Add every year ($)",
      "min": 0,
      "max": 5000,
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
        "sPut",
        "sEnd",
        "sInt"
      ]
    },
    {
      "id": "sPut",
      "component": "Stat",
      "label": "You put in",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s + a * n)",
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
      "id": "sEnd",
      "component": "Stat",
      "label": "You end up with",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r/100)^n + if(r == 0, a * n, a * ((1 + r/100)^n - 1) / (r/100)))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "r": {
              "@path": "/rate"
            },
            "n": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "sInt",
      "component": "Stat",
      "label": "Free money from interest",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r/100)^n + if(r == 0, a * n, a * ((1 + r/100)^n - 1) / (r/100)) - s - a * n)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "a": {
              "@path": "/add"
            },
            "r": {
              "@path": "/rate"
            },
            "n": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "area",
      "x": "year",
      "y": [
        "balance",
        "deposited"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Money",
      "title": "Your money over time (balance vs. what you put in)",
      "data": {
        "@call": "series",
        "args": {
          "from": 0,
          "to": {
            "@path": "/years"
          },
          "index": "year",
          "columns": {
            "balance": "round(s * (1 + r/100)^year + if(r == 0, a * year, a * ((1 + r/100)^year - 1) / (r/100)))",
            "deposited": "s + a * year"
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
      "id": "callout",
      "component": "Callout",
      "tone": "info",
      "title": "Try this",
      "text": "1) Set the rate to 0%: a straight line. 2) Put it back to 7% and slide Years from 10 to 40: the last decade adds the most. 3) Compare starting with $5,000 for 40 years vs. adding $1,000 a year for 10 years. Starting early wins."
    }
  ]
}
```

<!-- pi:result #toolu_0143o8xrc5StiVgugs9QfXe3 -->

```
ok
```

<!-- pi -->

I've built a compound interest playground for your class. It has sliders for starting money, yearly deposits, interest rate and years.

It shows three figures: what the student put in, what they end up with, and the interest earned. A chart plots the balance against the deposits, and the gap between them is the interest.

I included a "Try this" box with three experiments:
- **0% rate:** the balance is a straight line.
- **Years from 10 to 40:** the last decade adds the most.
- **Starting early:** $5,000 for 40 years beats $1,000 a year for 10 years.

I haven't checked it by moving the sliders or comparing the figures against a hand calculation.

<!-- you -->

