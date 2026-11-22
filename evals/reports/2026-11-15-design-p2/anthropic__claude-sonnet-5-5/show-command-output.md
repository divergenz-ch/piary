Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_016aRUVGBSC2MRjpR8qJgPwW -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -30",
  "timeout": 10
}
```

<!-- pi:result #toolu_016aRUVGBSC2MRjpR8qJgPwW -->

```
run-tests.sh
```

<!-- pi:tool terminal #toolu_014wGsx3HvW9cPJnkmK6KtWc -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 300
}
```

<!-- pi:result #toolu_014wGsx3HvW9cPJnkmK6KtWc -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script ran, and all 3 tests passed: parses, renders and saves.

<!-- you -->

