Show me what's in `data/sales.csv`.

<!-- pi:tool budget #call_14f2c6a434aa4bbfa1696b1daa69cd1f|fc_0fdb449e41bed204016aefc3442ef487d284aec1d50dd71b61 -->

```json
{
  "minutes": 1,
  "reason": "Read the CSV and render its contents as a table."
}
```

<!-- pi:result #call_14f2c6a434aa4bbfa1696b1daa69cd1f|fc_0fdb449e41bed204016aefc3442ef487d284aec1d50dd71b61 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_382a1cd7f63e42ffaa949c685742f3e2|fc_0fdb449e41bed204016aefc3459b7887d299decd12c0e09893 -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 2000
}
```

<!-- pi:result #call_382a1cd7f63e42ffaa949c685742f3e2|fc_0fdb449e41bed204016aefc3459b7887d299decd12c0e09893 -->

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

