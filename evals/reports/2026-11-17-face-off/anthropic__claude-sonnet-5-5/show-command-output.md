Run the test script and let me watch its output.

<!-- pi:tool bash #toolu_01P86kHKFqJaGEUAN9A1xcRq -->

```json
{
  "command": "ls; cat package.json 2>/dev/null | head -30; ls *test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01P86kHKFqJaGEUAN9A1xcRq -->

```
run-tests.sh
run-tests.sh
```

<!-- pi:tool terminal #toolu_01As2B2GiTFFLRuKmXPH3soT -->

```json
{
  "command": "bash run-tests.sh",
  "timeout": 120
}
```

<!-- pi:result #toolu_01As2B2GiTFFLRuKmXPH3soT -->

```
ok - parses
ok - renders
ok - saves
3 passed
```

<!-- pi -->

The test script, `run-tests.sh`, passed all 3 tests: parses, renders and saves.

<!-- you -->

