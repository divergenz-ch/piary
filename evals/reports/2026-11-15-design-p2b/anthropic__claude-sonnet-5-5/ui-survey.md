Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_01WxxyDnLJVLvA92xUP6w5FS -->

```json
{
  "command": "python3 -c \"\nfor n,d in [('s',[9,21,38,88,56]),('d',[31,52,61,47,21]),('r',[6,14,40,79,73])]:\n t=sum(d);print(n,t,round(sum((i+1)*x for i,x in enumerate(d))/t,2),round((d[3]+d[4])/t*100),round((d[0]+d[1])/t*100))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01WxxyDnLJVLvA92xUP6w5FS -->

```
s 212 3.76 68 14
d 212 2.88 32 39
r 212 3.94 72 9
```

<!-- pi:view a2ui #toolu_01BFtkseH6W8SGERGrBa9JsR -->

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
        "w"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey: 212 responses"
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
      "label": "Setup was easy (mean, % agree)",
      "value": 3.76,
      "note": "68% agree · 14% disagree"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Docs answered my questions",
      "value": 2.88,
      "note": "32% agree · 39% disagree"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "Would recommend",
      "value": 3.94,
      "note": "72% agree · 9% disagree"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "q",
      "y": [
        "Strongly disagree",
        "Disagree",
        "Neutral",
        "Agree",
        "Strongly agree"
      ],
      "data": [
        {
          "q": "Setup was easy",
          "Strongly disagree": 9,
          "Disagree": 21,
          "Neutral": 38,
          "Agree": 88,
          "Strongly agree": 56
        },
        {
          "q": "Docs answered my questions",
          "Strongly disagree": 31,
          "Disagree": 52,
          "Neutral": 61,
          "Agree": 47,
          "Strongly agree": 21
        },
        {
          "q": "Would recommend",
          "Strongly disagree": 6,
          "Disagree": 14,
          "Neutral": 40,
          "Agree": 79,
          "Strongly agree": 73
        }
      ],
      "yLabel": "Responses"
    },
    {
      "id": "w",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong. Docs are the weak spot: the only item where more people disagree than agree. Prioritise docs."
    }
  ]
}
```

<!-- pi:result #toolu_01BFtkseH6W8SGERGrBa9JsR -->

```
ok
```

<!-- pi -->

I've charted the survey results above. The main points for your meeting:

- **Recommend:** This scored best, with a mean of 3.94 and 72% agreeing.
- **Setup:** 68% found it easy (mean 3.76), and 14% disagreed.
- **Docs:** This is the weak spot, with a mean of 2.88. 39% disagreed and only 32% agreed, so it's the only item where more people disagreed than agreed.

I'd suggest putting docs first on the improvement list.

<!-- you -->

