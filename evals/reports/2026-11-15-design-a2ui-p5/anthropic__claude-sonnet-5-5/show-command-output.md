Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_01Wa5oW1gz7NaS6F4prsvUYd -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -30",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Wa5oW1gz7NaS6F4prsvUYd -->

```
run-tests.sh
```

<!-- pi:tool terminal #toolu_01UdksQV22GbSpPc11JFz1bC -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 300
}
```

<!-- pi:result #toolu_01UdksQV22GbSpPc11JFz1bC -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script ran and all 3 tests passed: parses, renders and saves.

<!-- you -->

