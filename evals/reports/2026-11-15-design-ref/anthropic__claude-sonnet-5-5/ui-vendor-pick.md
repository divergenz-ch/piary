We're picking an error-tracking vendor. Sentry: $26/seat/month, 90-day retention, SSO yes, self-host yes. Rollbar: $21/seat, 30 days, SSO enterprise only, no self-host. Bugsnag: $29/seat, 60 days, SSO yes, no self-host. Honeybadger: $19/seat, 45 days, SSO no, no self-host. We are 14 engineers and need SSO. Help me decide.

<!-- pi:view a2ui #toolu_01C4ePxpCC9HcBq1D6BWULYu -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "cmp",
        "why"
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
          "monthly": 364,
          "days": 90,
          "sso": "Yes",
          "selfHost": "Yes"
        },
        {
          "name": "Rollbar",
          "monthly": 294,
          "days": 30,
          "sso": "Enterprise only",
          "selfHost": "No"
        },
        {
          "name": "Bugsnag",
          "monthly": 406,
          "days": 60,
          "sso": "Yes",
          "selfHost": "No"
        },
        {
          "name": "Honeybadger",
          "monthly": 266,
          "days": 45,
          "sso": "No",
          "selfHost": "No"
        }
      ],
      "criteria": [
        {
          "key": "monthly",
          "label": "Monthly cost for 14 seats",
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
              "Yes"
            ]
          }
        },
        {
          "key": "selfHost",
          "label": "Self-host"
        }
      ]
    },
    {
      "id": "why",
      "component": "Callout",
      "tone": "success",
      "title": "Pick Sentry",
      "text": "It's the only option with SSO included, the longest retention (90 days) and self-hosting. It costs $42/month more than Bugsnag's gap suggests: actually $42 less. Rollbar's SSO needs an enterprise quote."
    }
  ]
}
```

<!-- pi:result #toolu_01C4ePxpCC9HcBq1D6BWULYu -->

```
ok
```

<!-- pi:thinking -->

I've noticed my callout text came out garbled, so it needs fixing. The numbers are Sentry at $364 against Bugsnag at $406, which makes Sentry $42 cheaper. I'll try editing the callout with canvas_edit, since it's already in view, though I'm not certain that tool will work on it.

<!-- pi:tool canvas_edit #toolu_011Fc8FS3TPd6gXCskpLai6Q -->

```json
{
  "oldText": "It costs $42/month more than Bugsnag's gap suggests: actually $42 less.",
  "newText": "It's also $42/month cheaper than Bugsnag, the other option with SSO."
}
```

<!-- pi:result #toolu_011Fc8FS3TPd6gXCskpLai6Q error -->

```
not applied: the page did not answer. No Piary page is open to apply this. Write the change in your answer and say you could not apply it; do not edit the conversation's file.
```

<!-- pi -->

I recommend **Sentry**. The callout in the comparison above has a garbled sentence that I couldn't fix. It should read: "It's also $42/month cheaper than Bugsnag, the other option with SSO."

- **Cost:** Sentry is $364/month for 14 seats.
- **Retention:** It keeps data for 90 days, the longest of the four.
- **Self-hosting:** It's the only one that offers it.
- **SSO:** Only Sentry and Bugsnag include SSO. Bugsnag costs $406/month and keeps data for 60 days.
- **Ruled out:** Honeybadger has no SSO. Rollbar only offers SSO on its enterprise plan, so its $294/month price would likely go up.

<!-- you -->

