Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_013Fd4bE9VFzVACoVyVBbY5F -->

```json
{
  "command": "python3 -c \"\nfor n,d in [('easy',[9,21,38,88,56]),('docs',[31,52,61,47,21]),('rec',[6,14,40,79,73])]:\n  t=sum(d);print(n,t,round((d[3]+d[4])/t*100,1),round((d[0]+d[1])/t*100,1),round(sum((i+1)*x for i,x in enumerate(d))/t,2))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_013Fd4bE9VFzVACoVyVBbY5F -->

```
easy 212 67.9 14.2 3.76
docs 212 32.1 39.2 2.88
rec 212 71.7 9.4 3.94
```

<!-- pi:view a2ui #toolu_01L2FJZTakRvGQNQQp7aDuyu -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "k",
        "c",
        "w"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## Onboarding survey (212 answers): setup and advocacy are strong, docs are the weak spot"
    },
    {
      "id": "k",
      "component": "Row",
      "children": [
        "a",
        "b",
        "d"
      ]
    },
    {
      "id": "a",
      "component": "Stat",
      "label": "Setup was easy: agree",
      "value": 67.9,
      "unit": "%",
      "note": "mean 3.76 · 14.2% disagree"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Docs answered my questions: agree",
      "value": 32.1,
      "unit": "%",
      "note": "mean 2.88 · 39.2% disagree"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "Would recommend: agree",
      "value": 71.7,
      "unit": "%",
      "note": "mean 3.94 · 9.4% disagree"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "pct",
      "y": "question",
      "series": "rating",
      "title": "Share of answers by rating (1 = strongly disagree, 5 = strongly agree)",
      "unit": "%",
      "data": [
        {
          "question": "Setup was easy",
          "rating": "1",
          "pct": 4.2
        },
        {
          "question": "Setup was easy",
          "rating": "2",
          "pct": 9.9
        },
        {
          "question": "Setup was easy",
          "rating": "3",
          "pct": 17.9
        },
        {
          "question": "Setup was easy",
          "rating": "4",
          "pct": 41.5
        },
        {
          "question": "Setup was easy",
          "rating": "5",
          "pct": 26.4
        },
        {
          "question": "Docs answered my questions",
          "rating": "1",
          "pct": 14.6
        },
        {
          "question": "Docs answered my questions",
          "rating": "2",
          "pct": 24.5
        },
        {
          "question": "Docs answered my questions",
          "rating": "3",
          "pct": 28.8
        },
        {
          "question": "Docs answered my questions",
          "rating": "4",
          "pct": 22.2
        },
        {
          "question": "Docs answered my questions",
          "rating": "5",
          "pct": 9.9
        },
        {
          "question": "I would recommend us",
          "rating": "1",
          "pct": 2.8
        },
        {
          "question": "I would recommend us",
          "rating": "2",
          "pct": 6.6
        },
        {
          "question": "I would recommend us",
          "rating": "3",
          "pct": 18.9
        },
        {
          "question": "I would recommend us",
          "rating": "4",
          "pct": 37.3
        },
        {
          "question": "I would recommend us",
          "rating": "5",
          "pct": 34.4
        }
      ]
    },
    {
      "id": "w",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Docs are the only item where more people disagree than agree. Worth prioritising; 72% would recommend us despite this."
    }
  ]
}
```

<!-- pi:result #toolu_01L2FJZTakRvGQNQQp7aDuyu -->

```
ok
```

<!-- pi -->

I've put the summary in the view above. The headline is that setup and advocacy are strong and docs are the weak spot.

- **Setup was easy:** 68% agree (4 or 5) and 14% disagree.
- **Would recommend us:** 72% agree and 9% disagree. This is the strongest result.
- **Docs answered my questions:** 32% agree and 39% disagree. It's the only item where more people disagree than agree. The average is 2.88, below the neutral 3.

For the meeting, I'd suggest making docs the priority. People recommend us anyway, but that may be despite the docs. The survey doesn't say which docs fell short, so a follow-up question on that would help.

<!-- you -->

