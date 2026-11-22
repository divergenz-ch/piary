Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_015qMxSSVhsWTLnk3h5eY3zX -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -20; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_015qMxSSVhsWTLnk3h5eY3zX error -->

```
run-tests.sh


Command exited with code 1
```

<!-- pi:tool terminal #toolu_01C5Dog1ZQXVyKC3QaAfeF6C -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 120
}
```

<!-- pi:result #toolu_01C5Dog1ZQXVyKC3QaAfeF6C -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script (`run-tests.sh`) ran and all 3 tests passed: parses, renders and saves.

<!-- you -->

