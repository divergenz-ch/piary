Show me what's in `data/sales.csv`.

<!-- pi:tool budget #call_1e28e25dfcac4ce2b3e05b044cfe71c6|fc_0612182e77629959016af067a6ce9087d2a6389283ed261ac2 -->

```json
{
  "minutes": 1,
  "reason": "Read the CSV and render its contents as a table."
}
```

<!-- pi:result #call_1e28e25dfcac4ce2b3e05b044cfe71c6|fc_0612182e77629959016af067a6ce9087d2a6389283ed261ac2 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_bbee8469b5154130a4ae6a0eef3c6298|fc_0612182e77629959016af067a8907087d2873391a46e758dfe -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 2000
}
```

<!-- pi:result #call_bbee8469b5154130a4ae6a0eef3c6298|fc_0612182e77629959016af067a8907087d2873391a46e758dfe -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi:view table #call_5a7453ce82a34313adec82cd0fbd326a|fc_0612182e77629959016af067a9eebc87d29c4122f3d6a5201e -->

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

<!-- pi:result #call_5a7453ce82a34313adec82cd0fbd326a|fc_0612182e77629959016af067a9eebc87d29c4122f3d6a5201e -->

```
ok
```

<!-- pi -->

`data/sales.csv` contains 4 sales records with columns: `region`, `quarter`, and `revenue`.

<!-- you -->

