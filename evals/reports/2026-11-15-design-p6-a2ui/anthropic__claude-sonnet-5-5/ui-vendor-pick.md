We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01QtBF7jeui2ZYGkyCUktoN9 -->

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
      "text": "## Error tracking vendors, 14 seats, SSO required"
    },
    {
      "id": "cmp",
      "component": "Compare",
      "pick": "Sentry",
      "options": [
        {
          "name": "Sentry",
          "price": 26,
          "monthly": 364,
          "retention": 90,
          "sso": "Yes",
          "selfhost": "Yes"
        },
        {
          "name": "Rollbar",
          "price": 21,
          "monthly": 294,
          "retention": 30,
          "sso": "Enterprise only",
          "selfhost": "No"
        },
        {
          "name": "Bugsnag",
          "price": 29,
          "monthly": 406,
          "retention": 60,
          "sso": "Yes",
          "selfhost": "No"
        },
        {
          "name": "Honeybadger",
          "price": 19,
          "monthly": 266,
          "retention": 45,
          "sso": "No",
          "selfhost": "No"
        }
      ],
      "criteria": [
        {
          "key": "price",
          "label": "Per seat",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "monthly",
          "label": "Team per month",
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
          "key": "selfhost",
          "label": "Self-host"
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "success",
      "title": "Pick Sentry",
      "text": "Honeybadger fails SSO; Rollbar's SSO needs an enterprise plan with unlisted pricing. Sentry beats Bugsnag on price ($42/mo less), retention (90 vs 60 days) and self-hosting."
    }
  ]
}
```

<!-- pi:result #toolu_01QtBF7jeui2ZYGkyCUktoN9 -->

```
ok
```

<!-- pi -->

I'd pick Sentry. It meets the SSO requirement, has the longest retention (90 days), and is the only one you can self-host. It also costs $364/month for 14 seats, which is $42/month less than Bugsnag, the only other vendor with plain SSO.

Honeybadger is cheapest, but it has no SSO. Rollbar only offers SSO on its enterprise tier, which you'd have to price separately.

I used the per-seat list prices you gave me and didn't check them against current vendor pricing.

<!-- you -->

