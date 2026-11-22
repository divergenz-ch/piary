We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01FqgFWe2VxoW2P72NRWwAYe -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "cmp",
        "k",
        "c"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## Vendor pick for 14 engineers (SSO required)"
    },
    {
      "id": "cmp",
      "component": "Compare",
      "pick": "Sentry",
      "options": [
        {
          "name": "Sentry",
          "price": 26,
          "cost": 4368,
          "ret": 90,
          "sso": "Yes",
          "host": "Yes"
        },
        {
          "name": "Bugsnag",
          "price": 29,
          "cost": 4872,
          "ret": 60,
          "sso": "Yes",
          "host": "No"
        },
        {
          "name": "Rollbar",
          "price": 21,
          "cost": 3528,
          "ret": 30,
          "sso": "Enterprise only",
          "host": "No"
        },
        {
          "name": "Honeybadger",
          "price": 19,
          "cost": 3192,
          "ret": 45,
          "sso": "No",
          "host": "No"
        }
      ],
      "criteria": [
        {
          "key": "price",
          "label": "Per seat/month",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "cost",
          "label": "Annual, 14 seats",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "ret",
          "label": "Retention (days)",
          "best": "max"
        },
        {
          "key": "sso",
          "label": "SSO",
          "must": {
            "oneOf": [
              "Yes"
            ]
          }
        },
        {
          "key": "host",
          "label": "Self-host"
        }
      ]
    },
    {
      "id": "k",
      "component": "Stat",
      "label": "Sentry annual (14 seats)",
      "value": 4368,
      "unit": "$"
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "success",
      "title": "Pick Sentry",
      "text": "Honeybadger fails SSO; Rollbar's SSO needs an enterprise plan (price unknown, likely above Sentry). Sentry beats Bugsnag on price, retention and self-hosting, saving $504/year."
    }
  ]
}
```

<!-- pi:result #toolu_01FqgFWe2VxoW2P72NRWwAYe -->

```
ok
```

<!-- pi -->

I'd pick Sentry. It's the cheapest of the two options that include SSO, and it has the longest retention.

- **Honeybadger** is out because it has no SSO.
- **Rollbar** only offers SSO on its enterprise tier. You'd have to get a quote, and it will probably cost more than the listed $21 per seat.
- **Bugsnag** has SSO, but it costs $504 a year more than Sentry (14 seats × $3 × 12). It also keeps data for 60 days instead of 90, and you can't self-host it.

Sentry comes to $4,368 a year for 14 seats. I'm assuming SSO is included at the listed price, so confirm that before you sign.

<!-- you -->

