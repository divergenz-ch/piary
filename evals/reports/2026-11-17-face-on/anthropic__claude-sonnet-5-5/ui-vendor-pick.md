We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01K1Lxj2YUwoajrckQH7mw9C -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "cmp",
        "note"
      ]
    },
    {
      "id": "h",
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
          "monthly": 364,
          "annual": 4368,
          "retention": 90,
          "sso": "Yes",
          "selfhost": "Yes"
        },
        {
          "name": "Bugsnag",
          "monthly": 406,
          "annual": 4872,
          "retention": 60,
          "sso": "Yes",
          "selfhost": "No"
        },
        {
          "name": "Rollbar",
          "monthly": 294,
          "annual": 3528,
          "retention": 30,
          "sso": "Enterprise only",
          "selfhost": "No"
        },
        {
          "name": "Honeybadger",
          "monthly": 266,
          "annual": 3192,
          "retention": 45,
          "sso": "No",
          "selfhost": "No"
        }
      ],
      "criteria": [
        {
          "key": "monthly",
          "label": "Monthly cost",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "annual",
          "label": "Annual cost",
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
      "id": "note",
      "component": "Callout",
      "tone": "success",
      "title": "Pick Sentry",
      "text": "Honeybadger fails SSO and Rollbar only offers it on its enterprise tier, whose price you'd have to quote. Of the two that qualify, Sentry is $42/month cheaper than Bugsnag, keeps data longer (90 vs 60 days) and can be self-hosted."
    }
  ]
}
```

<!-- pi:result #toolu_01K1Lxj2YUwoajrckQH7mw9C -->

```
ok
```

<!-- pi -->

I'd pick **Sentry**: about $364/month, or $4,368/year, for 14 seats.

- **Honeybadger** is out because it has no SSO.
- **Rollbar** has SSO only on its enterprise tier. Its listed price doesn't include that, so the real cost is unknown.
- **Bugsnag** meets the SSO requirement but costs $42/month more than Sentry. It also keeps data for 60 days against Sentry's 90, and it can't be self-hosted.

Sentry is the cheapest option that meets your SSO requirement. It also has the longest retention and is the only one you can self-host.

These figures assume list prices. Check whether Sentry's SSO sits in a higher plan tier, since SSO is often gated that way. I didn't check that.

<!-- you -->

