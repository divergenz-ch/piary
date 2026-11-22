Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_01NScwuLGZJAuzcj7HHsxvrb -->

```json
{
  "command": "python3 -c \"\nfor n,d in [('setup',[9,21,38,88,56]),('docs',[31,52,61,47,21]),('rec',[6,14,40,79,73])]:\n  s=sum(d);print(n,s,round(100*(d[3]+d[4])/s,1),round(100*(d[0]+d[1])/s,1),round(sum((i+1)*x for i,x in enumerate(d))/s,2))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01NScwuLGZJAuzcj7HHsxvrb -->

```
setup 212 67.9 14.2 3.76
docs 212 32.1 39.2 2.88
rec 212 71.7 9.4 3.94
```

<!-- pi:view a2ui #toolu_01BTE1z3Path5bpDtJj339Qp -->

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
      "text": "## Onboarding survey (n=212): setup and recommendations are good, docs are the weak spot"
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
      "note": "mean 3.76, 14.2% disagree"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Docs answered my questions: agree",
      "value": 32.1,
      "unit": "%",
      "note": "mean 2.88, 39.2% disagree"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "Would recommend: agree",
      "value": 71.7,
      "unit": "%",
      "note": "mean 3.94, 9.4% disagree"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "count",
      "y": "question",
      "series": "rating",
      "title": "Responses by rating (1 = strongly disagree, 5 = strongly agree)",
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
      "id": "w",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Docs are the only item where more people disagree than agree (39% vs 32%). Prioritise docs; setup and advocacy are strong."
    }
  ]
}
```

<!-- pi:result #toolu_01BTE1z3Path5bpDtJj339Qp -->

```
ok
```

<!-- pi -->

I've put the summary in the view above. All three questions were answered by all 212 people, and "agree" means a 4 or 5.

- **Setup was easy:** 68% agree and 14% disagree.
- **Docs answered my questions:** only 32% agree, and 39% disagree. This is the one weak spot, and the only question where more people disagree than agree.
- **I would recommend us:** 72% agree and 9% disagree, the strongest result.

For the meeting, I'd suggest making docs the priority. People still recommend us despite weak docs, so better docs could lift that further. I can't tell from this data which parts of the docs fall short. A short follow-up question or a look at support tickets would show that.

<!-- you -->

