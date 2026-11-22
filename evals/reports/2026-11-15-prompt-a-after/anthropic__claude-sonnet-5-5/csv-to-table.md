Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_01HndZAAfYCbdtmkKcixbhKa -->

```json
{
  "command": "head -c 1500 data/sales.csv; wc -l data/sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_01HndZAAfYCbdtmkKcixbhKa -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
       5 data/sales.csv
```

<!-- pi:view a2ui #toolu_01Rjosh9zdpUUD2Nf4jveZf6 -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Table",
      "caption": "data/sales.csv, 4 rows",
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
      ]
    }
  ]
}
```

<!-- pi:result #toolu_01Rjosh9zdpUUD2Nf4jveZf6 -->

```
ok
```

<!-- pi -->

`data/sales.csv` has three columns (region, quarter, revenue) and four data rows. The table above shows them.

<!-- you -->

