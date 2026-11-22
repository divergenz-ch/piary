Show me what's in `data/sales.csv`.

<!-- pi:tool budget #call_1babbfb650bf4cbeac14588d68148023|fc_0d28e7859e160076016af83707075087d2a0693239a0a15628 -->

```json
{
  "minutes": 1,
  "reason": "Read the CSV and present its contents in a table."
}
```

<!-- pi:result #call_1babbfb650bf4cbeac14588d68148023|fc_0d28e7859e160076016af83707075087d2a0693239a0a15628 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_475b94c46a674512a5580a24bfaf21db|fc_0d28e7859e160076016af83709506887d293376220c7df496d -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 2000
}
```

<!-- pi:result #call_475b94c46a674512a5580a24bfaf21db|fc_0d28e7859e160076016af83709506887d293376220c7df496d -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi:view table #call_ab6b6e707acf456ca14b98da80cd352c|fc_0d28e7859e160076016af8370a8e7087d2a89615e557a1de60 -->

```json
{
  "columns": [
    "region",
    "quarter",
    "revenue"
  ],
  "rows": [
    [
      "North",
      "Q1",
      "120000"
    ],
    [
      "North",
      "Q2",
      "135000"
    ],
    [
      "South",
      "Q1",
      "98000"
    ],
    [
      "South",
      "Q2",
      "101500"
    ]
  ]
}
```

<!-- pi:result #call_ab6b6e707acf456ca14b98da80cd352c|fc_0d28e7859e160076016af8370a8e7087d2a89615e557a1de60 -->

```
ok
```

<!-- pi -->

`data/sales.csv` contains 4 sales records with columns: region, quarter, and revenue.

<!-- you -->

