Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_011FGtFjEUuZr39CAYVdTm43 -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -20; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_011FGtFjEUuZr39CAYVdTm43 error -->

```
run-tests.sh


Command exited with code 1
```

<!-- pi:tool terminal #toolu_013ie993xWzyzVn4aZLbcASx -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 300
}
```

<!-- pi:result #toolu_013ie993xWzyzVn4aZLbcASx -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script `run-tests.sh` ran and all 3 tests passed: parses, renders and saves.

<!-- you -->

