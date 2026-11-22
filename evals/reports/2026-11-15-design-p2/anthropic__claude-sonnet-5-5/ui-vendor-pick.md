We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_014GKtiZ6rbrGi8cob4KUGhb -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "cmp",
        "note"
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
          "cost": 364,
          "days": 90,
          "sso": "yes",
          "self": "yes"
        },
        {
          "name": "Rollbar",
          "cost": 294,
          "days": 30,
          "sso": "enterprise",
          "self": "no"
        },
        {
          "name": "Bugsnag",
          "cost": 406,
          "days": 60,
          "sso": "yes",
          "self": "no"
        },
        {
          "name": "Honeybadger",
          "cost": 266,
          "days": 45,
          "sso": "no",
          "self": "no"
        }
      ],
      "criteria": [
        {
          "key": "cost",
          "label": "Monthly cost (14 seats)",
          "best": "min",
          "unit": "$"
        },
        {
          "key": "days",
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
          "key": "self",
          "label": "Self-host"
        }
      ]
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "success",
      "title": "Sentry",
      "text": "Meets SSO, longest retention, only self-host option, and $42/mo cheaper than Bugsnag. Rollbar's SSO is enterprise-only, so its list price understates the real cost."
    }
  ]
}
```

<!-- pi:result #toolu_014GKtiZ6rbrGi8cob4KUGhb -->

```
ok
```

<!-- pi -->

I'd pick **Sentry**, at about $364/month for 14 seats. The matrix above shows the comparison.

- **Honeybadger** is out because it has no SSO.
- **Rollbar** is out on the list prices you gave me. SSO is enterprise-only there, so $294/month isn't the real cost. You'd need a quote to know it.
- **Bugsnag** does have SSO, but it costs about $42/month more than Sentry. It also keeps data for 60 days instead of 90, and it can't be self-hosted.

Sentry is the cheaper of the two vendors that offer SSO at the listed price. It also has the longest retention and is the only one you can self-host. Check that its SSO is included in the $26 seat plan, because vendors sometimes limit SSO to higher tiers.

<!-- you -->

