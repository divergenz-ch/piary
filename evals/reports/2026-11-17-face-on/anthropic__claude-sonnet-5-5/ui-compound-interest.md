I teach a finance class for 16-year-olds and they don't get compound interest. Make something they can play with in class.

<!-- pi:view a2ui #toolu_0121qJM9E3agzgKHV5sQpZnX -->

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
      "text": "## Compound interest: money that makes money"
    },
    {
      "id": "intro",
      "component": "Text",
      "text": "Move the sliders. Compare the **simple** line (interest only on what you first put in) with the **compound** line (interest also on past interest).",
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
      "min": 0,
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
      "max": 3000,
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
      "label": "Compound balance",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r / 100) ^ y + if(r == 0, a * y, a * ((1 + r / 100) ^ y - 1) / (r / 100)))",
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
      "label": "Simple interest balance",
      "unit": "$",
      "value": {
        "@call": "calc",
        "args": {
          "expr": "round(s * (1 + r / 100 * y) + a * y + a * r / 100 * y * (y - 1) / 2)",
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
      "label": "Total you paid in",
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
        "paidIn"
      ],
      "unit": "$",
      "xLabel": "Years",
      "labels": {
        "compound": "Compound",
        "simple": "Simple",
        "paidIn": "What you paid in"
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
            "compound": "round(s * (1 + r / 100) ^ year + if(r == 0, a * year, a * ((1 + r / 100) ^ year - 1) / (r / 100)))",
            "simple": "round(s * (1 + r / 100 * year) + a * year + a * r / 100 * year * (year - 1) / 2)",
            "paidIn": "s + a * year"
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
      "text": "Set years to 10, then 30, then 50. The gap between the lines isn't steady, it explodes. Then set extra savings to 0 and compare 3% with 10%."
    }
  ]
}
```

<!-- pi:result #toolu_0121qJM9E3agzgKHV5sQpZnX -->

```
ok
```

<!-- pi -->

I've built an interactive page with sliders for starting money, interest rate, years and yearly extra savings. It has two lines: simple interest and compound interest. I haven't opened it to check how it renders. The gap between the lines is what shows compounding. There's also a line for the total paid in, so students can see how much of the balance is interest.

The "Try this" box at the bottom gives them two things to do. They can push the years from 10 to 30 to 50. Or they can compare 3% with 10% interest.

<!-- you -->

