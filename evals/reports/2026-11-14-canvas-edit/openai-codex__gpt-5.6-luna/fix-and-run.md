`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool budget #call_9148567602964b58bb1e4347a53cd506|fc_0e9ca6900d1f2245016af8371bf3d087d298e89902750d6cfb -->

```json
{
  "minutes": 3,
  "reason": "Inspect report.js, fix the runtime error, run it, and verify the output."
}
```

<!-- pi:result #call_9148567602964b58bb1e4347a53cd506|fc_0e9ca6900d1f2245016af8371bf3d087d298e89902750d6cfb -->

```
ok — budget 3 min
```

<!-- pi:tool read #call_adb3cccc3ba14668b43c93614ec1d3bd|fc_0e9ca6900d1f2245016af8371dea9c87d28880ba2f486477c3 -->

```json
{
  "path": "report.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_1eca210ec91c40cdb3eebfe30c3dd57e|fc_0e9ca6900d1f2245016af8371ec37887d294629c61fce742b0 -->

```json
{
  "command": "node report.js",
  "timeout": 20
}
```

<!-- pi:result #call_adb3cccc3ba14668b43c93614ec1d3bd|fc_0e9ca6900d1f2245016af8371dea9c87d28880ba2f486477c3 -->

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

<!-- pi:result #call_1eca210ec91c40cdb3eebfe30c3dd57e|fc_0e9ca6900d1f2245016af8371ec37887d294629c61fce742b0 error -->

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

<!-- pi:tool edit #call_a2d860fe471d473d8267dbb299645654|fc_0e9ca6900d1f2245016af837208ecc87d2858f322a9fac533d -->

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

<!-- pi:result #call_a2d860fe471d473d8267dbb299645654|fc_0e9ca6900d1f2245016af837208ecc87d2858f322a9fac533d -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_feb7f74ccf3341f3b1271b9830ce49c9|fc_0e9ca6900d1f2245016af837225ab087d2911b634a69401ed5 -->

```json
{
  "command": "node report.js",
  "timeout": 20
}
```

<!-- pi:result #call_feb7f74ccf3341f3b1271b9830ce49c9|fc_0e9ca6900d1f2245016af837225ab087d2911b634a69401ed5 -->

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

