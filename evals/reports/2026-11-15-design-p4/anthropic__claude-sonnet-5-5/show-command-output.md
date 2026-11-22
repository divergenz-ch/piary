Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_01KoWN73TpAwL9ioADRBonwW -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -30",
  "timeout": 10
}
```

<!-- pi:result #toolu_01KoWN73TpAwL9ioADRBonwW -->

```
run-tests.sh
```

<!-- pi:tool terminal #toolu_019hyqihiEodvT21TNtJGixE -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 120
}
```

<!-- pi:result #toolu_019hyqihiEodvT21TNtJGixE -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script `run-tests.sh` ran, and all 3 tests passed: parses, renders and saves.

<!-- you -->

