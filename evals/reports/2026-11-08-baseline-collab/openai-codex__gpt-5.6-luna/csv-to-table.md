Show me what's in `data/sales.csv`.

<!-- pi:tool budget #call_8a1d8363046e49f190417e5b4f35cedc|fc_0a18e413935e8a22016aefc131b53487d2a0da78a4a826616a -->

```json
{
  "minutes": 0.5,
  "reason": "Read the CSV and render its contents as a table."
}
```

<!-- pi:result #call_8a1d8363046e49f190417e5b4f35cedc|fc_0a18e413935e8a22016aefc131b53487d2a0da78a4a826616a -->

```
ok — budget 0.5 min
```

<!-- pi:tool read #call_446ae4557bfb4880b26d330651b749e4|fc_0a18e413935e8a22016aefc132f88487d2a9558816b9ea6bef -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 2000
}
```

<!-- pi:result #call_446ae4557bfb4880b26d330651b749e4|fc_0a18e413935e8a22016aefc132f88487d2a9558816b9ea6bef -->

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

