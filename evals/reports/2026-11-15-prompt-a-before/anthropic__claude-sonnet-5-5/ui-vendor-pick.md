We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_012rsu34z2j5Vw7sBb5KdxtK -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "cmp",
        "c"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## Error-tracking vendor, 14 seats, SSO required"
    },
    {
      "id": "cmp",
      "component": "Compare",
      "pick": "Sentry",
      "options": [
        {
          "name": "Sentry",
          "price": 26,
          "annual": 4368,
          "retention": 90,
          "sso": "Yes",
          "self": "Yes"
        },
        {
          "name": "Rollbar",
          "price": 21,
          "annual": 3528,
          "retention": 30,
          "sso": "Enterprise only",
          "self": "No"
        },
        {
          "name": "Bugsnag",
          "price": 29,
          "annual": 4872,
          "retention": 60,
          "sso": "Yes",
          "self": "No"
        },
        {
          "name": "Honeybadger",
          "price": 19,
          "annual": 3192,
          "retention": 45,
          "sso": "No",
          "self": "No"
        }
      ],
      "criteria": [
        {
          "key": "price",
          "label": "Per seat / month",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "annual",
          "label": "Annual, 14 seats",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "retention",
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
          "key": "self",
          "label": "Self-host"
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "success",
      "title": "Pick Sentry",
      "text": "Honeybadger lacks SSO and Rollbar gates it behind enterprise pricing. Sentry beats Bugsnag on price ($504/yr less), retention and self-hosting. Caveat: verify SSO is on the plan you'd buy, since vendors often tier it."
    }
  ]
}
```

<!-- pi:result #toolu_012rsu34z2j5Vw7sBb5KdxtK -->

```
ok
```

<!-- pi -->

I recommend Sentry. It meets your SSO requirement and has the longest retention, at 90 days. It also costs less than Bugsnag, the only other vendor with SSO on a standard plan, and it's the only one you can self-host.

Honeybadger has no SSO. Rollbar only offers SSO on its enterprise tier, so its price isn't comparable.

Before you commit, confirm that SSO is included in the Sentry plan you'd buy. Vendors often put it on a higher tier, and the price you quoted may not cover it.

<!-- you -->

