We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view table #toolu_01RDG9TonKDPpKiG9GFte9J1 -->

```json
{
  "columns": [
    "Vendor",
    "$/seat/mo",
    "14 seats/yr",
    "Retention",
    "SSO",
    "Self-host",
    "Fits?"
  ],
  "rows": [
    [
      "Sentry",
      "$26",
      "$4,368",
      "90 days",
      "Yes",
      "Yes",
      "Yes"
    ],
    [
      "Bugsnag",
      "$29",
      "$4,872",
      "60 days",
      "Yes",
      "No",
      "Yes"
    ],
    [
      "Rollbar",
      "$21",
      "$3,528 (before enterprise SSO uplift)",
      "30 days",
      "Enterprise only",
      "No",
      "Only on enterprise plan"
    ],
    [
      "Honeybadger",
      "$19",
      "$3,192",
      "45 days",
      "No",
      "No",
      "No (no SSO)"
    ]
  ]
}
```

<!-- pi:result #toolu_01RDG9TonKDPpKiG9GFte9J1 -->

```
ok
```

<!-- pi -->

**Recommendation: Sentry.**

- **Honeybadger is out.** It has no SSO.
- **Rollbar is probably out.** SSO needs the enterprise tier, so the $21 price doesn't cover what you need. It also has the shortest retention, at 30 days.
- **Sentry beats Bugsnag.** Sentry is $3/seat cheaper, about $504 a year for 14 seats. It also keeps data longer (90 days against 60) and can be self-hosted. Bugsnag has nothing that Sentry lacks.

Sentry costs about $364 a month, or $4,368 a year, at list price. Check whether the SSO you need is included in the plan you'd buy. Vendors sometimes put SSO in a higher tier, and I only have the figures you gave me.

Pick Bugsnag over Sentry only if you have a strong reason to prefer its product, such as stability reporting for mobile apps.

<!-- you -->

