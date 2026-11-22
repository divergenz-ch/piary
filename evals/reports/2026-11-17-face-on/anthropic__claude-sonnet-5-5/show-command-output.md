Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_01HkU3C7hcVnt75LyNqpivY5 -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -20; ls *test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01HkU3C7hcVnt75LyNqpivY5 -->

```
run-tests.sh
run-tests.sh
```

<!-- pi:tool terminal #toolu_01NWG5oneb6FvKBuEcoUqyDr -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 300
}
```

<!-- pi:result #toolu_01NWG5oneb6FvKBuEcoUqyDr -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script, `run-tests.sh`, passed all 3 tests: parses, renders and saves.

<!-- you -->

