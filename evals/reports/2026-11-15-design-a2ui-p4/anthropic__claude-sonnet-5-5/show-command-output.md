Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_01Vtzkhi3vy3xwnQPq7p9fSC -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -20; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Vtzkhi3vy3xwnQPq7p9fSC error -->

```
run-tests.sh


Command exited with code 1
```

<!-- pi:tool terminal #toolu_016bBitvbr6Z1YFtkChLayjU -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 120
}
```

<!-- pi:result #toolu_016bBitvbr6Z1YFtkChLayjU -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

`run-tests.sh` ran, and all 3 tests passed: parses, renders and saves.

<!-- you -->

