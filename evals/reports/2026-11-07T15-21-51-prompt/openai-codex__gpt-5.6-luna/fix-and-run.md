`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool budget #call_d037ceda74ed47c380dfae8617ab4213|fc_05946bb3effd0e9d016aef4233b2c887d2a95297304d435804 -->

```json
{
  "minutes": 3,
  "reason": "Inspect the script, identify and fix the crash, then run it to report the output."
}
```

<!-- pi:result #call_d037ceda74ed47c380dfae8617ab4213|fc_05946bb3effd0e9d016aef4233b2c887d2a95297304d435804 -->

```
ok — budget 3 min
```

<!-- pi:tool read #call_ad6cc06b234a4ce1b64251c739099814|fc_05946bb3effd0e9d016aef42350e4087d2b18fafc06b909ac3 -->

```json
{
  "path": "report.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_fd7f015cbaf2422eaa2e784516104a0f|fc_05946bb3effd0e9d016aef4235e6d487d2b0df9e6080972fbd -->

```json
{
  "command": "node report.js",
  "timeout": 30
}
```

<!-- pi:result #call_ad6cc06b234a4ce1b64251c739099814|fc_05946bb3effd0e9d016aef42350e4087d2b18fafc06b909ac3 -->

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

<!-- pi:result #call_fd7f015cbaf2422eaa2e784516104a0f|fc_05946bb3effd0e9d016aef4235e6d487d2b0df9e6080972fbd error -->

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

<!-- pi:tool edit #call_ff19fdb7e31d4ecd84eb74f456a22544|fc_05946bb3effd0e9d016aef4237342887d28d325c66baf8dce6 -->

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

<!-- pi:result #call_ff19fdb7e31d4ecd84eb74f456a22544|fc_05946bb3effd0e9d016aef4237342887d28d325c66baf8dce6 -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_16462a2ca7eb4a07a7e0ce4dbda901d6|fc_05946bb3effd0e9d016aef42392cec87d2aa7c14d04a364af1 -->

```json
{
  "command": "node report.js",
  "timeout": 30
}
```

<!-- pi:result #call_16462a2ca7eb4a07a7e0ce4dbda901d6|fc_05946bb3effd0e9d016aef42392cec87d2aa7c14d04a364af1 -->

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

