Show me what's in `data/sales.csv`.

<!-- pi:tool bash #toolu_01J3uLLQWpZ2GNUiwttnvEZy -->

```json
{
  "command": "head -c 3000 data/sales.csv; echo; wc -l data/sales.csv",
  "timeout": 10
}
```

<!-- pi:result #toolu_01J3uLLQWpZ2GNUiwttnvEZy -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500

       5 data/sales.csv
```

<!-- pi:view a2ui #toolu_01CdYuWKx9TLq8pQbQ8DRXiu -->

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

<!-- pi:result #toolu_01CdYuWKx9TLq8pQbQ8DRXiu -->

```
ok
```

<!-- pi -->

`data/sales.csv` has 4 data rows with the columns region, quarter and revenue. The table above shows them.

<!-- you -->

