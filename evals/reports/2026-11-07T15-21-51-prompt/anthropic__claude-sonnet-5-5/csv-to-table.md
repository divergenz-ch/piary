Show me what's in `data/sales.csv`.

<!-- pi:tool read #toolu_01HttNEZR1HcoGa3iZofx3bR -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool read #toolu_015VQQh7myRK1dSybu7u1Fto -->

```json
{}
```

<!-- pi:result #toolu_01HttNEZR1HcoGa3iZofx3bR -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi:result #toolu_015VQQh7myRK1dSybu7u1Fto error -->

```
Validation failed for tool "read":
  - path: must have required properties path

Received arguments:
{}
```

<!-- pi:view table #toolu_01AuK1bnbjqZQyGeUVvFwPs6 -->

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
      120000
    ],
    [
      "North",
      "Q2",
      135000
    ],
    [
      "South",
      "Q1",
      98000
    ],
    [
      "South",
      "Q2",
      101500
    ]
  ]
}
```

<!-- pi:result #toolu_01AuK1bnbjqZQyGeUVvFwPs6 -->

```
ok
```

<!-- pi -->

`data/sales.csv` has 4 data rows and 3 columns: region, quarter and revenue.

| region | quarter | revenue |
|---|---|---|
| North | Q1 | 120000 |
| North | Q2 | 135000 |
| South | Q1 | 98000 |
| South | Q2 | 101500 |

I passed the table template a guessed payload shape without reading the view-templates skill first. It returned ok, but I haven't checked that the table rendered correctly.

<!-- you -->

