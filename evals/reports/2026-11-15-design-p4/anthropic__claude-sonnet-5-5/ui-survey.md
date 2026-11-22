Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_01UtAvnEdmT1CGpTnCKytwhH -->

```json
{
  "command": "python3 -c \"\nfor n,d in [('setup',[9,21,38,88,56]),('docs',[31,52,61,47,21]),('rec',[6,14,40,79,73])]:\n    s=sum(d);print(n,s,round(sum((i+1)*x for i,x in enumerate(d))/s,2),round((d[3]+d[4])/s*100,1),round((d[0]+d[1])/s*100,1))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01UtAvnEdmT1CGpTnCKytwhH -->

```
setup 212 3.76 67.9 14.2
docs 212 2.88 32.1 39.2
rec 212 3.94 71.7 9.4
```

<!-- pi:view a2ui #toolu_01VZSaRFQoPHRhBDXNc8yM5k -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "k",
        "c",
        "cb"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey (212 answers): docs are the weak spot"
    },
    {
      "id": "k",
      "component": "Row",
      "children": [
        "s1",
        "s2",
        "s3"
      ]
    },
    {
      "id": "s1",
      "component": "Stat",
      "label": "Setup was easy: agree",
      "value": 67.9,
      "unit": "%",
      "note": "mean 3.76 · 14.2% disagree"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Docs answered my questions: agree",
      "value": 32.1,
      "unit": "%",
      "note": "mean 2.88 · 39.2% disagree"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "Would recommend: agree",
      "value": 71.7,
      "unit": "%",
      "note": "mean 3.94 · 9.4% disagree"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "bar",
      "layout": "stack",
      "x": "question",
      "y": "count",
      "series": "rating",
      "scheme": "diverging",
      "data": [
        {
          "question": "Setup easy",
          "rating": "1",
          "count": 9
        },
        {
          "question": "Setup easy",
          "rating": "2",
          "count": 21
        },
        {
          "question": "Setup easy",
          "rating": "3",
          "count": 38
        },
        {
          "question": "Setup easy",
          "rating": "4",
          "count": 88
        },
        {
          "question": "Setup easy",
          "rating": "5",
          "count": 56
        },
        {
          "question": "Docs helpful",
          "rating": "1",
          "count": 31
        },
        {
          "question": "Docs helpful",
          "rating": "2",
          "count": 52
        },
        {
          "question": "Docs helpful",
          "rating": "3",
          "count": 61
        },
        {
          "question": "Docs helpful",
          "rating": "4",
          "count": 47
        },
        {
          "question": "Docs helpful",
          "rating": "5",
          "count": 21
        },
        {
          "question": "Recommend",
          "rating": "1",
          "count": 6
        },
        {
          "question": "Recommend",
          "rating": "2",
          "count": 14
        },
        {
          "question": "Recommend",
          "rating": "3",
          "count": 40
        },
        {
          "question": "Recommend",
          "rating": "4",
          "count": 79
        },
        {
          "question": "Recommend",
          "rating": "5",
          "count": 73
        }
      ]
    },
    {
      "id": "cb",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and advocacy are strong (about 70% agree). Docs are the only question where more disagree than agree. Docs are the priority to fix."
    }
  ]
}
```

<!-- pi:result #toolu_01VZSaRFQoPHRhBDXNc8yM5k -->

```
ok
```

<!-- pi -->

I've put the summary in the view above. The docs question is the weak spot.

- **Docs:** Only 32% agree that the docs answered their questions, and 39% disagree. It's the only question where disagreement beats agreement.
- **Setup and recommendation:** Both score well. 68% agree that setup was easy, and 72% would recommend us.

I'd suggest the team look at the docs first.

The survey doesn't link answers to respondents, so I can't say whether weak docs scores go with weaker recommendation scores.

<!-- you -->

