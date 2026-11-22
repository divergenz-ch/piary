Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_01H8KJxUoXkbANWFh7skwjXk -->

```json
{
  "command": "head -c 1500 data/sales.csv; wc -l data/sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_01H8KJxUoXkbANWFh7skwjXk -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
       5 data/sales.csv
```

<!-- pi:view a2ui #toolu_01L8dyYSjkqatc6oUg5RSbm3 -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Table",
      "caption": "data/sales.csv (4 rows)",
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

<!-- pi:result #toolu_01L8dyYSjkqatc6oUg5RSbm3 -->

```
ok
```

<!-- pi -->

`data/sales.csv` has four data rows, shown in the table above. The columns are region, quarter and revenue, covering North and South for Q1 and Q2.

<!-- you -->

