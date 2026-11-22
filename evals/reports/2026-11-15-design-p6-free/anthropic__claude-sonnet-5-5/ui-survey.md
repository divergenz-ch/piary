Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_013TtvYDkmKv2gzbgVR4jbsa -->

```json
{
  "command": "python3 -c \"\nd={'Setup':[9,21,38,88,56],'Docs':[31,52,61,47,21],'Recommend':[6,14,40,79,73]}\nfor k,v in d.items():\n n=sum(v);print(k,n,round(sum((i+1)*x for i,x in enumerate(v))/n,2),round((v[3]+v[4])/n*100,1),round((v[0]+v[1])/n*100,1),round(v[2]/n*100,1))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_013TtvYDkmKv2gzbgVR4jbsa -->

```
Setup 212 3.76 67.9 14.2 17.9
Docs 212 2.88 32.1 39.2 28.8
Recommend 212 3.94 71.7 9.4 18.9
```

<!-- pi:view table #toolu_015dqSzkPXAVf2XqwtNFu9SM -->

```json
{
  "columns": [
    "Question",
    "Mean (of 5)",
    "Agree (4–5)",
    "Neutral (3)",
    "Disagree (1–2)"
  ],
  "rows": [
    [
      "Setup was easy",
      "3.76",
      "67.9%",
      "17.9%",
      "14.2%"
    ],
    [
      "Docs answered my questions",
      "2.88",
      "32.1%",
      "28.8%",
      "39.2%"
    ],
    [
      "I would recommend us",
      "3.94",
      "71.7%",
      "18.9%",
      "9.4%"
    ]
  ]
}
```

<!-- pi:result #toolu_015dqSzkPXAVf2XqwtNFu9SM -->

```
ok
```

<!-- pi -->

**Summary for the team meeting (n = 212)**

- **Recommendation is strong.** 72% agree and only 9% disagree. The mean is 3.94, the highest of the three questions.
- **Setup is a strength.** 68% found it easy and 14% didn't. Mean 3.76.
- **Docs are the weak spot.** Only 32% agree the docs answered their questions, and 39% disagree. That is more people disagreeing than agreeing. Mean 2.88, just under neutral.

**Takeaway:** People like the product and the setup, but the docs let them down. Docs are the clearest place to improve.

**Caveat:** I only have the counts, so I can't tell whether the same people were unhappy with setup and docs. If you can split the results by respondent, check whether people who rated docs low also rated recommend lower. That would show how much the docs problem costs you.

**Suggested discussion:** Which questions do people fail to get answered in the docs? Support tickets or a follow-up question on the survey could tell you.

<!-- you -->

