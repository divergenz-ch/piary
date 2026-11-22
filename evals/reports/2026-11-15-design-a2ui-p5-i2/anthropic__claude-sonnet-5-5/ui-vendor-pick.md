We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01J9qaKFF9cesRAkVSRubBEq -->

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
      "text": "## Error tracking: 14 seats, SSO required"
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
          "name": "Rollbar",
          "price": 21,
          "cost": 3528,
          "ret": 30,
          "sso": "Enterprise only",
          "host": "No"
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
          "label": "Per seat / month",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "cost",
          "label": "Yearly, 14 seats",
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
      "label": "Sentry extra vs Bugsnag per year",
      "value": 504,
      "unit": "$",
      "note": "Sentry is cheaper and keeps data longer"
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "success",
      "title": "Pick Sentry",
      "text": "It meets the SSO need, has the longest retention, and is the only self-host option. Rollbar's SSO needs an enterprise plan (price unknown), so it may cost more than listed."
    }
  ]
}
```

<!-- pi:result #toolu_01J9qaKFF9cesRAkVSRubBEq -->

```
ok
```

<!-- pi -->

Sentry is my pick. It's the only option with SSO, 90-day retention and self-hosting. It costs $4,368 a year for 14 seats.

- **Bugsnag:** It also has SSO, but it costs $504 a year more, keeps data for only 60 days, and can't be self-hosted.
- **Rollbar:** SSO is enterprise-only, so the real price is probably higher than $21 a seat.
- **Honeybadger:** It has no SSO, so it's ruled out.

<!-- you -->

