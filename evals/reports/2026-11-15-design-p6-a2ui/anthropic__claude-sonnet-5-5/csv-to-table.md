Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_011SGpQy5pLpVpNH31XhgvpJ -->

```json
{
  "command": "wc -l data/sales.csv; head -50 data/sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_011SGpQy5pLpVpNH31XhgvpJ -->

```
5 data/sales.csv
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi:view table #toolu_01WdwMEYGtEGUvivWdU5rdKJ -->

```json
{
  "rows": [
    {
      "region": "North",
      "quarter": "Q1",
      "revenue": 120000
    },
    {
      "region": "North",
      "quarter": "Q2",
      "revenue": 135000
    },
    {
      "region": "South",
      "quarter": "Q1",
      "revenue": 98000
    },
    {
      "region": "South",
      "quarter": "Q2",
      "revenue": 101500
    }
  ],
  "columns": [
    "region",
    "quarter",
    "revenue"
  ]
}
```

<!-- pi:result #toolu_01WdwMEYGtEGUvivWdU5rdKJ -->

```
ok
```

<!-- pi -->

`data/sales.csv` has 4 data rows with the columns region, quarter and revenue. They're in the table above.

<!-- you -->

