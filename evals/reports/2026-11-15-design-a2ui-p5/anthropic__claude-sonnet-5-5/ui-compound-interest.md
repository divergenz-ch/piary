I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_01VGdjXURcYGhtKbu8vJ9V7r -->

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
        "chart",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Watch your money snowball\nMove the sliders. Compare **simple interest** (only your deposits earn nothing extra) with **compound interest** (interest earns interest)."
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "kDep",
        "kSimple",
        "kComp",
        "kExtra"
      ]
    },
    {
      "id": "kDep",
      "component": "Stat",
      "label": "You put in",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s + m * 12 * y)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
              "@path": "/monthly"
            },
            "y": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "kSimple",
      "component": "Stat",
      "label": "Simple interest",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s + m * 12 * y + (s * y + m * 12 * y * (y + 1) / 2 / 12 * 12 / 12 * 12 / 12) * r / 100)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
              "@path": "/monthly"
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
      "id": "kComp",
      "component": "Stat",
      "label": "Compound interest",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * pow(1 + r / 1200, 12 * y) + if(r == 0, m * 12 * y, m * (pow(1 + r / 1200, 12 * y) - 1) / (r / 1200)))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
              "@path": "/monthly"
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
      "id": "kExtra",
      "component": "Stat",
      "label": "Free money from compounding",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * pow(1 + r / 1200, 12 * y) + if(r == 0, m * 12 * y, m * (pow(1 + r / 1200, 12 * y) - 1) / (r / 1200)) - (s + m * 12 * y))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
              "@path": "/monthly"
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
      "id": "monthlyIn",
      "component": "Slider",
      "label": "Add each month ($)",
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
      "id": "chart",
      "component": "Chart",
      "mark": "line",
      "x": "year",
      "y": [
        "deposits",
        "compound"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Balance",
      "labels": {
        "deposits": "Just your deposits (no interest)",
        "compound": "With compound interest"
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
            "deposits": "round(s + m * 12 * year)",
            "compound": "round(s * pow(1 + r / 1200, 12 * year) + if(r == 0, m * 12 * year, m * (pow(1 + r / 1200, 12 * year) - 1) / (r / 1200)))"
          },
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
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
      "text": "Set years to 10, then 30, then 50 without changing anything else. The gap between the lines explodes: time matters more than the amount."
    }
  ]
}
```

<!-- pi:result #toolu_01VGdjXURcYGhtKbu8vJ9V7r -->

```
ok
```

<!-- pi:thinking -->

I had put in a rough "Simple interest" stat with a broken formula, so I need to fix that. The simplest route is to drop the stat altogether, and I'll also reword the awkward title while I'm redoing it.

<!-- pi -->

I left a muddled "Simple interest" figure in that view, so I'm removing it and fixing the intro text.

<!-- pi:view a2ui #toolu_01QLnhsJpKJedFaBHgdqSbFo -->

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
        "chart",
        "why"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Watch your money snowball\nMove the sliders. Compound interest means the interest you earn starts earning interest too."
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "kDep",
        "kComp",
        "kExtra"
      ]
    },
    {
      "id": "kDep",
      "component": "Stat",
      "label": "You put in",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s + m * 12 * y)",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
              "@path": "/monthly"
            },
            "y": {
              "@path": "/years"
            }
          }
        }
      }
    },
    {
      "id": "kComp",
      "component": "Stat",
      "label": "You end up with",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * pow(1 + r / 1200, 12 * y) + if(r == 0, m * 12 * y, m * (pow(1 + r / 1200, 12 * y) - 1) / (r / 1200)))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
              "@path": "/monthly"
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
      "id": "kExtra",
      "component": "Stat",
      "label": "Free money from interest",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * pow(1 + r / 1200, 12 * y) + if(r == 0, m * 12 * y, m * (pow(1 + r / 1200, 12 * y) - 1) / (r / 1200)) - (s + m * 12 * y))",
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
              "@path": "/monthly"
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
      "id": "monthlyIn",
      "component": "Slider",
      "label": "Add each month ($)",
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
      "id": "chart",
      "component": "Chart",
      "mark": "line",
      "x": "year",
      "y": [
        "deposits",
        "compound"
      ],
      "unit": "$",
      "xLabel": "Years",
      "yLabel": "Balance",
      "labels": {
        "deposits": "Just your deposits (no interest)",
        "compound": "With compound interest"
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
            "deposits": "round(s + m * 12 * year)",
            "compound": "round(s * pow(1 + r / 1200, 12 * year) + if(r == 0, m * 12 * year, m * (pow(1 + r / 1200, 12 * year) - 1) / (r / 1200)))"
          },
          "vars": {
            "s": {
              "@path": "/start"
            },
            "m": {
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
      "text": "Set years to 10, then 30, then 50 without touching anything else. The gap between the lines explodes: time matters more than the amount."
    }
  ]
}
```

<!-- pi:result #toolu_01QLnhsJpKJedFaBHgdqSbFo -->

```
ok
```

<!-- pi -->

I built a compound interest calculator your students can play with. It has four sliders: starting money, monthly deposit, yearly interest rate and years. I haven't checked how it looks or behaves on screen, and I didn't check the results by hand.

- **Numbers:** three figures update as the sliders move: what they put in, what they end up with, and the free money from interest.
- **Chart:** two lines compare just their deposits with deposits plus compound interest. The gap between the lines is the compounding.
- **Model:** interest is added monthly (the rate divided by 12), and the monthly deposit is added every month.

It includes a "Try this" prompt: set years to 10, then 30, then 50 and leave everything else alone. The gap grows faster than the deposits do, which shows that time matters more than the amount.

My first version had a muddled "simple interest" figure. I replaced it with a second version that doesn't have it, so ignore the first view if both are on the page.

<!-- you -->

