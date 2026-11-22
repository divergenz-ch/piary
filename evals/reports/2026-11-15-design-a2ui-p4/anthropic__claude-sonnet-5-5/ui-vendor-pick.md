We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01HFCjsvo52BvzN2KmGFV7Sf -->

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
      "text": "## Error-tracking vendor for 14 engineers (SSO required)"
    },
    {
      "id": "cmp",
      "component": "Compare",
      "pick": "Sentry",
      "options": [
        {
          "name": "Sentry",
          "monthly": 364,
          "retention": 90,
          "sso": "yes",
          "selfhost": "yes"
        },
        {
          "name": "Rollbar",
          "monthly": 294,
          "retention": 30,
          "sso": "enterprise only",
          "selfhost": "no"
        },
        {
          "name": "Bugsnag",
          "monthly": 406,
          "retention": 60,
          "sso": "yes",
          "selfhost": "no"
        },
        {
          "name": "Honeybadger",
          "monthly": 266,
          "retention": 45,
          "sso": "no",
          "selfhost": "no"
        }
      ],
      "criteria": [
        {
          "key": "monthly",
          "label": "Monthly cost (14 seats)",
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
              "yes"
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
      "text": "Honeybadger fails the SSO requirement. Rollbar only has SSO on its enterprise tier, so its real price is unknown. Of the two that qualify, Sentry is $42/month cheaper than Bugsnag, with longer retention and self-hosting. Caveat: list prices only. Check Sentry's SSO plan tier and Rollbar's enterprise quote if cost matters most."
    }
  ]
}
```

<!-- pi:result #toolu_01HFCjsvo52BvzN2KmGFV7Sf -->

```
ok
```

<!-- pi -->

I'd pick Sentry. The comparison above has the figures.

- **Honeybadger** is out because it has no SSO.
- **Rollbar** has SSO only on its enterprise tier, so the $21/seat price doesn't cover it.
- **Bugsnag** does qualify, but it costs $42/month more than Sentry for 14 seats. It also keeps data for 60 days against Sentry's 90, and it can't be self-hosted.

The prices are list prices. Before you commit, check which Sentry plan includes SSO, since it may be a higher tier than the $26 seat price. If you want a Rollbar comparison, ask them for an enterprise quote.

<!-- you -->

