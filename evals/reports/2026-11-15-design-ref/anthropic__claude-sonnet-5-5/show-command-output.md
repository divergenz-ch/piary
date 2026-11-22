Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_014yZGJaGu4kK1vp7HTZ6UzX -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -20; ls *test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_014yZGJaGu4kK1vp7HTZ6UzX -->

```
run-tests.sh
run-tests.sh
```

<!-- pi:tool terminal #toolu_01TVGnzBJ364YSnjDVK1KtTK -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 120
}
```

<!-- pi:result #toolu_01TVGnzBJ364YSnjDVK1KtTK -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

`run-tests.sh` ran, and all 3 tests passed: parses, renders and saves.

<!-- you -->

