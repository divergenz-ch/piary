Show me what's in `data/sales.csv`.

<!-- pi:tool budget #call_a129e7008bc04455bd1ee8a4d0ab2422|fc_060c8580bdb137b8016af04de04bcc87d29e47fe257d15014c -->

```json
{
  "minutes": 0.5,
  "reason": "Inspect the CSV and render its contents as a table."
}
```

<!-- pi:result #call_a129e7008bc04455bd1ee8a4d0ab2422|fc_060c8580bdb137b8016af04de04bcc87d29e47fe257d15014c -->

```
ok — budget 0.5 min
```

<!-- pi:tool read #call_9adb5452f5814ba3a3c8a8e2a66bbae4|fc_060c8580bdb137b8016af04de19d8087d29d5a507e5e478e8d -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 2000
}
```

<!-- pi:result #call_9adb5452f5814ba3a3c8a8e2a66bbae4|fc_060c8580bdb137b8016af04de19d8087d29d5a507e5e478e8d -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi -->

| region | quarter | revenue |
|---|---|---:|
| North | Q1 | 120000 |
| North | Q2 | 135000 |
| South | Q1 | 98000 |
| South | Q2 | 101500 |

<!-- you -->

