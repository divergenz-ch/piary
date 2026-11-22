Show me what's in `data/sales.csv`.

<!-- pi:tool budget #call_011716562d5344268616d184edffc3c3|fc_0420299e980e9b15016aef4220b86487d297fc57590433a525 -->

```json
{
  "minutes": 0.5,
  "reason": "Read the CSV and render its contents as a table."
}
```

<!-- pi:result #call_011716562d5344268616d184edffc3c3|fc_0420299e980e9b15016aef4220b86487d297fc57590433a525 -->

```
ok — budget 0.5 min
```

<!-- pi:tool read #call_896baa529c5c495eac49d67007a1691e|fc_0420299e980e9b15016aef422241c087d28ab6b6760090481e -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 2000
}
```

<!-- pi:result #call_896baa529c5c495eac49d67007a1691e|fc_0420299e980e9b15016aef422241c087d28ab6b6760090481e -->

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

