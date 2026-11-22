Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_015zvQhiT9HmeeUnFZpi3tRs -->

```json
{
  "command": "python3 -c \"\nfor n,d in [('setup',[9,21,38,88,56]),('docs',[31,52,61,47,21]),('rec',[6,14,40,79,73])]:\n    t=sum(d);print(n,t,round(100*(d[3]+d[4])/t,1),round(100*(d[0]+d[1])/t,1),round(sum((i+1)*x for i,x in enumerate(d))/t,2))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_015zvQhiT9HmeeUnFZpi3tRs -->

```
setup 212 67.9 14.2 3.76
docs 212 32.1 39.2 2.88
rec 212 71.7 9.4 3.94
```

<!-- pi:view a2ui #toolu_015sj3EEiXyZAj5mbb4g2Lyi -->

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
        "t",
        "call"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey (n=212): docs are the weak spot"
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
      "label": "Setup easy (agree)",
      "value": 67.9,
      "unit": "%",
      "note": "mean 3.76 · 14.2% disagree"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Docs helpful (agree)",
      "value": 32.1,
      "unit": "%",
      "note": "mean 2.88 · 39.2% disagree"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "Would recommend (agree)",
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
      "x": "question",
      "y": [
        "Strongly disagree",
        "Disagree",
        "Neutral",
        "Agree",
        "Strongly agree"
      ],
      "unit": "",
      "data": [
        {
          "question": "Setup was easy",
          "Strongly disagree": 9,
          "Disagree": 21,
          "Neutral": 38,
          "Agree": 88,
          "Strongly agree": 56
        },
        {
          "question": "Docs answered my questions",
          "Strongly disagree": 31,
          "Disagree": 52,
          "Neutral": 61,
          "Agree": 47,
          "Strongly agree": 21
        },
        {
          "question": "I would recommend us",
          "Strongly disagree": 6,
          "Disagree": 14,
          "Neutral": 40,
          "Agree": 79,
          "Strongly agree": 73
        }
      ],
      "title": "Responses per question (count)"
    },
    {
      "id": "t",
      "component": "Text",
      "text": "- **Recommend** is strongest: 152 of 212 agree, and 73 chose 5.\n- **Setup** is solid: 144 agree; 30 found it hard.\n- **Docs** are the problem: only 68 agree vs 83 disagree, and 31 strongly disagree.\n- Customers recommend us despite weak docs, so better docs look like the clearest upside."
    },
    {
      "id": "call",
      "component": "Callout",
      "tone": "warning",
      "title": "Suggested discussion",
      "text": "Which questions do docs fail to answer? Review the 83 negative responses, if free-text exists, and prioritise fixes."
    }
  ]
}
```

<!-- pi:result #toolu_015sj3EEiXyZAj5mbb4g2Lyi -->

```
ok
```

<!-- pi -->

I've put the summary above as three stat tiles, a stacked chart of the responses and a few bullets. The main finding is that the docs are the weak spot.

- **Would recommend:** this is the strongest result. 71.7% agree (152 of 212), and only 9.4% disagree.
- **Setup was easy:** 67.9% agree, and 14.2% disagree.
- **Docs answered my questions:** only 32.1% agree, while 39.2% disagree (83 people). It is the only question where more people disagree than agree.

People recommend us even though the docs rate poorly, so improving the docs looks like the clearest chance to do better. If the survey has free-text comments, read the 83 negative docs responses first to see which questions the docs don't answer.

<!-- you -->

