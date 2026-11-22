Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_012DgPxULgEpA7Cwve4Ct32h -->

```json
{
  "command": "wc -l data/sales.csv; head -50 data/sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_012DgPxULgEpA7Cwve4Ct32h -->

```
5 data/sales.csv
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi:view table #toolu_01Xjg8FiJNf2QhYPz5eqUdds -->

```json
{
  "columns": [
    {
      "key": "region",
      "label": "Region"
    },
    {
      "key": "quarter",
      "label": "Quarter"
    },
    {
      "key": "revenue",
      "label": "Revenue",
      "align": "end"
    }
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
  "caption": "data/sales.csv: 4 rows"
}
```

<!-- pi:result #toolu_01Xjg8FiJNf2QhYPz5eqUdds -->

```
ok
```

<!-- pi -->

`data/sales.csv` has 4 data rows and 3 columns: region, quarter and revenue. The table above shows them.

<!-- you -->

