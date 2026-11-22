Show me what's in `data/sales.csv`.

<!-- pi:tool bash #call_7b59f5b716764769ab051f5033e799ac|fc_06633ae34fffefa3016aef341a4c4887d2a20340f198194264 -->

```json
{
  "command": "printf '%s\\n' '--- data/sales.csv ---'; if [ -f data/sales.csv ]; then wc -l data/sales.csv; else printf 'File not found\\n'; fi",
  "timeout": 10
}
```

<!-- pi:result #call_7b59f5b716764769ab051f5033e799ac|fc_06633ae34fffefa3016aef341a4c4887d2a20340f198194264 -->

```
--- data/sales.csv ---
       5 data/sales.csv
```

<!-- pi:tool read #call_a15971a661ec45208616e7f02e5515ad|fc_06633ae34fffefa3016aef341c428c87d2b939557d9959740a -->

```json
{
  "path": "data/sales.csv",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:result #call_a15971a661ec45208616e7f02e5515ad|fc_06633ae34fffefa3016aef341c428c87d2b939557d9959740a -->

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

