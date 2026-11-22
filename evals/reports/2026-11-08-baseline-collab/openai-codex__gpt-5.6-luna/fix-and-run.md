`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool budget #call_87d668d09a92470d8026c769e914151e|fc_02d2ebae509018cf016aefc13e3e0087d2a9660d48ffab4d83 -->

```json
{
  "minutes": 2,
  "reason": "Inspect the script, identify the runtime error, patch it, and rerun it to report the output."
}
```

<!-- pi:result #call_87d668d09a92470d8026c769e914151e|fc_02d2ebae509018cf016aefc13e3e0087d2a9660d48ffab4d83 -->

```
ok — budget 2 min
```

<!-- pi:tool read #call_f5282805d8714117b6d92f0fd518cf60|fc_02d2ebae509018cf016aefc1405f3887d2b7b337173719a16a -->

```json
{
  "path": "report.js",
  "offset": 1,
  "limit": 400
}
```

<!-- pi:tool bash #call_5c51464242f54facae94df2bd7100fe5|fc_02d2ebae509018cf016aefc14137e087d29992df9f49a60c81 -->

```json
{
  "command": "node report.js",
  "timeout": 30
}
```

<!-- pi:result #call_f5282805d8714117b6d92f0fd518cf60|fc_02d2ebae509018cf016aefc1405f3887d2b7b337173719a16a -->

```
const orders = [
	{ id: 1, amount: 40 },
	{ id: 2, amount: 25 },
];

const total = orders.reduce((sum, order) => sum + order.ammount, 0);
console.log(`Total: ${total.toFixed(2)}`);
console.log(`Largest: ${Math.max(...orders.map((o) => o.amount))}`);
throw new Error("unreachable" + undefinedVariable);
```

<!-- pi:result #call_5c51464242f54facae94df2bd7100fe5|fc_02d2ebae509018cf016aefc14137e087d29992df9f49a60c81 error -->

```
Total: NaN
Largest: 40
<scratch>/workspace/report.js:9
throw new Error("unreachable" + undefinedVariable);
                                ^

ReferenceError: undefinedVariable is not defined
    at Object.<anonymous> (<scratch>/workspace/report.js:9:33)
    at Module._compile (node:internal/modules/cjs/loader:1871:14)
    at Object..js (node:internal/modules/cjs/loader:2002:10)
    at Module.load (node:internal/modules/cjs/loader:1594:32)
    at Module._load (node:internal/modules/cjs/loader:1396:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47

Node.js v24.18.0


Command exited with code 1
```

<!-- pi:tool edit #call_eab6c5dcfba84623802dba87fff77003|fc_02d2ebae509018cf016aefc1420efc87d2b389ba4855e6c367 -->

```json
{
  "path": "report.js",
  "edits": [
    {
      "oldText": "order.ammount",
      "newText": "order.amount"
    },
    {
      "oldText": "throw new Error(\"unreachable\" + undefinedVariable);\n",
      "newText": ""
    }
  ]
}
```

<!-- pi:result #call_eab6c5dcfba84623802dba87fff77003|fc_02d2ebae509018cf016aefc1420efc87d2b389ba4855e6c367 -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_440191c7820d4618b26f6ab9f6a98dc2|fc_02d2ebae509018cf016aefc143e13887d2942a1c657be00707 -->

```json
{
  "command": "node report.js",
  "timeout": 30
}
```

<!-- pi:result #call_440191c7820d4618b26f6ab9f6a98dc2|fc_02d2ebae509018cf016aefc143e13887d2942a1c657be00707 -->

```
Total: 65.00
Largest: 40
```

<!-- pi -->

Fixed `report.js`. It now prints:

```text
Total: 65.00
Largest: 40
```

<!-- you -->

