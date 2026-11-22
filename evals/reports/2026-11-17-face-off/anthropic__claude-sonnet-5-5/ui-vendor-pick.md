We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01Ua3kevLDtVFZRjTP1zDxiR -->

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
      "text": "## Error tracking vendor, 14 seats, SSO required"
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
          "selfhost": "Yes"
        },
        {
          "name": "Bugsnag",
          "price": 29,
          "annual": 4872,
          "retention": 60,
          "sso": "Yes",
          "selfhost": "No"
        },
        {
          "name": "Rollbar",
          "price": 21,
          "annual": 3528,
          "retention": 30,
          "sso": "Enterprise only",
          "selfhost": "No"
        },
        {
          "name": "Honeybadger",
          "price": 19,
          "annual": 3192,
          "retention": 45,
          "sso": "No",
          "selfhost": "No"
        }
      ],
      "criteria": [
        {
          "key": "price",
          "label": "$/seat/month",
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
      "text": "Honeybadger fails on SSO; Rollbar only has SSO on its enterprise tier, with unquoted pricing. Sentry beats Bugsnag on price, retention (90 vs 60 days) and self-hosting, at $504/yr less."
    }
  ]
}
```

<!-- pi:result #toolu_01Ua3kevLDtVFZRjTP1zDxiR -->

```
ok
```

<!-- pi -->

I'd pick **Sentry**. The comparison above has the details.

- **Honeybadger** is out because it has no SSO.
- **Rollbar** only offers SSO on its enterprise tier. That tier's price isn't in your numbers, so its $21 list price doesn't count for much.
- **Sentry vs Bugsnag:** both have SSO. Sentry costs less ($4,368 vs $4,872 a year for 14 seats), keeps data longer (90 vs 60 days) and can be self-hosted.

The annual figures are list price × 14 seats × 12 months. They don't include any volume discounts or event-quota overages, so check those before you sign.

<!-- you -->

