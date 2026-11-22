Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_01EjpmjxcGGR2pCd4Fas5RPG -->

```json
{
  "command": "python3 -c \"\nd={'Setup':[9,21,38,88,56],'Docs':[31,52,61,47,21],'Rec':[6,14,40,79,73]}\nfor k,v in d.items():\n n=sum(v);print(k,n,round((v[3]+v[4])/n*100,1),round((v[0]+v[1])/n*100,1),round(sum((i+1)*x for i,x in enumerate(v))/n,2))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01EjpmjxcGGR2pCd4Fas5RPG -->

```
Setup 212 67.9 14.2 3.76
Docs 212 32.1 39.2 2.88
Rec 212 71.7 9.4 3.94
```

<!-- pi:view a2ui #toolu_016gnjuMfZZ1sNrSv26TtuTp -->

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
        "t"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey (n = 212)"
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
      "label": "Setup easy: agree",
      "value": 67.9,
      "unit": "%",
      "note": "mean 3.76 · 14.2% disagree"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Docs helpful: agree",
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
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "count",
      "y": "q",
      "series": "rating",
      "title": "Responses by rating (1 = strongly disagree, 5 = strongly agree)",
      "data": [
        {
          "q": "Setup",
          "rating": "1",
          "count": 9
        },
        {
          "q": "Setup",
          "rating": "2",
          "count": 21
        },
        {
          "q": "Setup",
          "rating": "3",
          "count": 38
        },
        {
          "q": "Setup",
          "rating": "4",
          "count": 88
        },
        {
          "q": "Setup",
          "rating": "5",
          "count": 56
        },
        {
          "q": "Docs",
          "rating": "1",
          "count": 31
        },
        {
          "q": "Docs",
          "rating": "2",
          "count": 52
        },
        {
          "q": "Docs",
          "rating": "3",
          "count": 61
        },
        {
          "q": "Docs",
          "rating": "4",
          "count": 47
        },
        {
          "q": "Docs",
          "rating": "5",
          "count": 21
        },
        {
          "q": "Recommend",
          "rating": "1",
          "count": 6
        },
        {
          "q": "Recommend",
          "rating": "2",
          "count": 14
        },
        {
          "q": "Recommend",
          "rating": "3",
          "count": 40
        },
        {
          "q": "Recommend",
          "rating": "4",
          "count": 79
        },
        {
          "q": "Recommend",
          "rating": "5",
          "count": 73
        }
      ]
    },
    {
      "id": "t",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong (about 68–72% agree). Docs are the weak spot: more people disagree (39%) than agree (32%). Prioritise docs."
    }
  ]
}
```

<!-- pi:result #toolu_016gnjuMfZZ1sNrSv26TtuTp -->

```
ok
```

<!-- pi -->

I've put the summary above as three headline figures, a chart of all responses and a takeaway. The percentages are the share who chose 4 or 5. The means are on the 1–5 scale.

- **Setup was easy:** 67.9% agree, 14.2% disagree, mean 3.76.
- **Would recommend us:** 71.7% agree, 9.4% disagree, mean 3.94.
- **Docs answered my questions:** 32.1% agree, 39.2% disagree, mean 2.88.

Docs are the one area to work on, since more people disagree than agree. Setup and recommendation are both strong.

I haven't compared recommendation with the other two questions, for example whether people who rated docs low are less likely to recommend. The counts you gave can't show that, because they aren't broken down by respondent.

<!-- you -->

