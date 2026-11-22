Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_01Lo2RwTm8Lisob1pCnm8o4q -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -30; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Lo2RwTm8Lisob1pCnm8o4q error -->

```
run-tests.sh


Command exited with code 1
```

<!-- pi:tool terminal #toolu_01S38NjxHWePkq9TGmqxfN4b -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 300
}
```

<!-- pi:result #toolu_01S38NjxHWePkq9TGmqxfN4b -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script, `run-tests.sh`, ran and all 3 tests passed: parses, renders and saves.

<!-- you -->

