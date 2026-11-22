Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_01PooVREvcCNRVe12C2KZjEn -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -30",
  "timeout": 10
}
```

<!-- pi:result #toolu_01PooVREvcCNRVe12C2KZjEn -->

```
run-tests.sh
```

<!-- pi:tool terminal #toolu_015pYAVbN938X4zDvkFk1sVy -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 120
}
```

<!-- pi:result #toolu_015pYAVbN938X4zDvkFk1sVy -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

I ran `run-tests.sh`, and all 3 tests passed: `parses`, `renders` and `saves`.

<!-- you -->

