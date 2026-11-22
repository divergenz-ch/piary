We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01BwUkFPWLN3ojbuU9oUeS2L -->

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
      "text": "## Recommendation: Sentry"
    },
    {
      "id": "cmp",
      "component": "Compare",
      "pick": "Sentry",
      "options": [
        {
          "name": "Sentry",
          "cost": 364,
          "ret": 90,
          "sso": "Yes",
          "self": "Yes"
        },
        {
          "name": "Rollbar",
          "cost": 294,
          "ret": 30,
          "sso": "Enterprise only",
          "self": "No"
        },
        {
          "name": "Bugsnag",
          "cost": 406,
          "ret": 60,
          "sso": "Yes",
          "self": "No"
        },
        {
          "name": "Honeybadger",
          "cost": 266,
          "ret": 45,
          "sso": "No",
          "self": "No"
        }
      ],
      "criteria": [
        {
          "key": "cost",
          "label": "Monthly cost, 14 seats",
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
          "key": "self",
          "label": "Self-host"
        }
      ]
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "success",
      "title": "Why",
      "text": "Honeybadger fails the SSO requirement; Rollbar only has it on an enterprise plan (price unknown). Of Sentry and Bugsnag, Sentry is $42/month cheaper, keeps data longest and can self-host. Verify Sentry's SSO plan tier pricing, since SSO is often on higher tiers."
    }
  ]
}
```

<!-- pi:result #toolu_01BwUkFPWLN3ojbuU9oUeS2L -->

```
ok
```

<!-- pi -->

I'd pick **Sentry**. The comparison above shows the numbers.

- **Requirement:** SSO is required, which rules out Honeybadger. Rollbar only offers SSO on its enterprise plan, so its $21/seat price probably doesn't include it.
- **Sentry vs Bugsnag:** Both have SSO. Sentry is cheaper ($364 vs $406 a month for 14 seats), keeps data longer (90 vs 60 days) and can be self-hosted.
- **To check:** Confirm that the $26/seat Sentry plan includes SSO. Vendors often put SSO on a higher tier, and Bugsnag may have the same catch.

<!-- you -->

