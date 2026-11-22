Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_01VXo2GjYGogtyoyQ3xCUASc -->

```json
{
  "command": "head -c 3000 data/sales.csv; echo; wc -l data/sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_01VXo2GjYGogtyoyQ3xCUASc -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500

       5 data/sales.csv
```

<!-- pi:view table #toolu_01TiCBwFQwErYpEgME3Reukt -->

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

<!-- pi:result #toolu_01TiCBwFQwErYpEgME3Reukt -->

```
ok
```

<!-- pi -->

`data/sales.csv` has 4 rows with the columns region, quarter and revenue. The table above shows them.

<!-- you -->

