Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_01Q8edEK2xa32qLN5Ypi4vpx -->

```json
{
  "command": "wc -l data/sales.csv; head -50 data/sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Q8edEK2xa32qLN5Ypi4vpx -->

```
5 data/sales.csv
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi:view a2ui #toolu_01PRB4zfyxLzm15FjtC3ZfBr -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Table",
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
  ]
}
```

<!-- pi:result #toolu_01PRB4zfyxLzm15FjtC3ZfBr -->

```
ok
```

<!-- pi -->

`data/sales.csv` has 4 data rows and 3 columns: region, quarter and revenue. The table above shows them.

<!-- you -->

