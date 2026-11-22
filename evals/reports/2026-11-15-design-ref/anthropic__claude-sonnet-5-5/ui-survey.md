Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_014VztTcRd3vCVVJpcUt49T5 -->

```json
{
  "command": "python3 -c \"\nfor n,d in [('setup',[9,21,38,88,56]),('docs',[31,52,61,47,21]),('rec',[6,14,40,79,73])]:\n t=sum(d);print(n,t,round(sum((i+1)*x for i,x in enumerate(d))/t,2),round((d[3]+d[4])/t*100),round((d[0]+d[1])/t*100),round(d[2]/t*100))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_014VztTcRd3vCVVJpcUt49T5 -->

```
setup 212 3.76 68 14 18
docs 212 2.88 32 39 29
rec 212 3.94 72 9 19
```

<!-- pi:view a2ui #toolu_014sYxxcctfoY3X6wu6ua979 -->

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
      "text": "## Onboarding survey (212 responses)"
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
      "value": 68,
      "unit": "%",
      "note": "mean 3.76, 14% disagree"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Docs answered my questions: agree",
      "value": 32,
      "unit": "%",
      "note": "mean 2.88, 39% disagree"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "Would recommend: agree",
      "value": 72,
      "unit": "%",
      "note": "mean 3.94, 9% disagree"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "pct",
      "y": "q",
      "series": "rating",
      "title": "Share of answers by rating, %",
      "data": [
        {
          "q": "Setup easy",
          "rating": "1",
          "pct": 4
        },
        {
          "q": "Setup easy",
          "rating": "2",
          "pct": 10
        },
        {
          "q": "Setup easy",
          "rating": "3",
          "pct": 18
        },
        {
          "q": "Setup easy",
          "rating": "4",
          "pct": 42
        },
        {
          "q": "Setup easy",
          "rating": "5",
          "pct": 26
        },
        {
          "q": "Docs helpful",
          "rating": "1",
          "pct": 15
        },
        {
          "q": "Docs helpful",
          "rating": "2",
          "pct": 25
        },
        {
          "q": "Docs helpful",
          "rating": "3",
          "pct": 29
        },
        {
          "q": "Docs helpful",
          "rating": "4",
          "pct": 22
        },
        {
          "q": "Docs helpful",
          "rating": "5",
          "pct": 10
        },
        {
          "q": "Recommend",
          "rating": "1",
          "pct": 3
        },
        {
          "q": "Recommend",
          "rating": "2",
          "pct": 7
        },
        {
          "q": "Recommend",
          "rating": "3",
          "pct": 19
        },
        {
          "q": "Recommend",
          "rating": "4",
          "pct": 37
        },
        {
          "q": "Recommend",
          "rating": "5",
          "pct": 34
        }
      ]
    },
    {
      "id": "w",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong. Docs are the weak spot: more people disagree (39%) than agree (32%). Docs are the clear priority."
    }
  ]
}
```

<!-- pi:result #toolu_014sYxxcctfoY3X6wu6ua979 -->

```
ok
```

<!-- pi -->

I've summarised the survey as a chart with three headline figures. "Agree" below means ratings 4 and 5.

- **Setup was easy:** 68% agree, 14% disagree (mean 3.76). Setup is working well.
- **I would recommend us:** 72% agree, 9% disagree (mean 3.94). This is the strongest result.
- **Docs answered my questions:** only 32% agree and 39% disagree (mean 2.88). It's the only question where disagreement outweighs agreement.

For the meeting, I'd suggest making the docs the priority. It would help to find out which questions people couldn't get answered. Reviewing support tickets or adding a free-text follow-up on the survey would show that.

<!-- you -->

