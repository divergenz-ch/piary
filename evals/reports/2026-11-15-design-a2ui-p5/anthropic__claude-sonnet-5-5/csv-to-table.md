Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_01Lidmb7SuoVyqeabU8PBquo -->

```json
{
  "command": "cd data && wc -l sales.csv && head -50 sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Lidmb7SuoVyqeabU8PBquo -->

```
5 sales.csv
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi:view table #toolu_01TH89EM2Cggh79awtfMRHGh -->

```json
{
  "columns": [
    "region",
    "quarter",
    "revenue"
  ],
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
  "caption": "data/sales.csv — 4 rows"
}
```

<!-- pi:result #toolu_01TH89EM2Cggh79awtfMRHGh -->

```
ok
```

<!-- pi -->

`data/sales.csv` has 4 data rows with the columns region, quarter and revenue. They're in the table above.

<!-- you -->

