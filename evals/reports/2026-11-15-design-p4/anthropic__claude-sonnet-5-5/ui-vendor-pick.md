We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01LjVLUmEyrHLBpgosgegeWg -->

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
          "host": "Yes"
        },
        {
          "name": "Rollbar",
          "cost": 294,
          "ret": 30,
          "sso": "Enterprise only",
          "host": "No"
        },
        {
          "name": "Bugsnag",
          "cost": 406,
          "ret": 60,
          "sso": "Yes",
          "host": "No"
        },
        {
          "name": "Honeybadger",
          "cost": 266,
          "ret": 45,
          "sso": "No",
          "host": "No"
        }
      ],
      "criteria": [
        {
          "key": "cost",
          "label": "Monthly, 14 seats",
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
      "id": "note",
      "component": "Callout",
      "tone": "success",
      "title": "Why",
      "text": "Honeybadger fails the SSO need; Rollbar's SSO needs an enterprise plan (price unknown). Of the rest, Sentry is $42/month cheaper than Bugsnag, with longer retention and self-hosting. Check Sentry's SSO tier pricing, since SSO is often on a higher plan."
    }
  ]
}
```

<!-- pi:result #toolu_01LjVLUmEyrHLBpgosgegeWg -->

```
ok
```

<!-- pi -->

I'd pick Sentry. It's the only vendor that has SSO and also gives you the longest retention (90 days) and a self-host option. At 14 seats it costs about $364/month, which is $42 less than Bugsnag.

- **Honeybadger:** Out, because it has no SSO.
- **Rollbar:** SSO is enterprise only, so the real price is probably well above the listed $21/seat.
- **Bugsnag:** Meets the SSO need but costs more than Sentry and has shorter retention.

One thing to check before you commit: confirm which Sentry plan includes SSO. If it's a higher tier than the $26/seat one, the cost gap to Bugsnag may shrink.

<!-- you -->

