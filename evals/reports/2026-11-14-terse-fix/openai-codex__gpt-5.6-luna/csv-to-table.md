Show me what's in `data/sales.csv`.

<!-- pi:tool budget #call_6a04879e3df24d3fb1b6e3dca88f81f0|fc_09a3474fedafcf99016af8711c143487d2b671673becf35dcb -->

```json
{
  "minutes": 1,
  "reason": "Read and display the CSV contents."
}
```

<!-- pi:result #call_6a04879e3df24d3fb1b6e3dca88f81f0|fc_09a3474fedafcf99016af8711c143487d2b671673becf35dcb -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_6430a0d8b9fb49fa8bece789968d62df|fc_09a3474fedafcf99016af8711d685887d2a6a3cc2f8648c63d -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 2000
}
```

<!-- pi:result #call_6430a0d8b9fb49fa8bece789968d62df|fc_09a3474fedafcf99016af8711d685887d2a6a3cc2f8648c63d -->

```
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- pi -->

```csv
region,quarter,revenue
North,Q1,120000
North,Q2,135000
South,Q1,98000
South,Q2,101500
```

<!-- you -->

