`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool bash #call_6c492ceec5a649d38cd55d4fc6f1c1b3|fc_0b19c34f7ccbcd5a016aef33e9214087d2a39da1d2f2f92074 -->

```json
{
  "command": "ls -la && printf '\\n--- files ---\\n' && find . -maxdepth 2 -type f -print && printf '\\n--- run ---\\n' && node report.js",
  "timeout": 30
}
```

<!-- pi:result #call_6c492ceec5a649d38cd55d4fc6f1c1b3|fc_0b19c34f7ccbcd5a016aef33e9214087d2a39da1d2f2f92074 error -->

```
total 8
drwxr-xr-x@ 3 user  staff   96 Nov  7 17:21 .
drwx------@ 5 user  staff  160 Nov  7 17:21 ..
-rw-r--r--@ 1 user  staff  302 Nov  7 17:21 report.js

--- files ---
./report.js

--- run ---
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

<!-- pi:tool read #call_2678fba0abc4456d9a87213337701936|fc_0b19c34f7ccbcd5a016aef33eb42e887d2b1321f5563904939 -->

```json
{
  "path": "report.js",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:result #call_2678fba0abc4456d9a87213337701936|fc_0b19c34f7ccbcd5a016aef33eb42e887d2b1321f5563904939 -->

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

<!-- pi:tool edit #call_23ed61ae6fb14342b6423592b373a93b|fc_0b19c34f7ccbcd5a016aef33ec65e887d2a0b2d4d9c01be4db -->

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

<!-- pi:result #call_23ed61ae6fb14342b6423592b373a93b|fc_0b19c34f7ccbcd5a016aef33ec65e887d2a0b2d4d9c01be4db -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_effaae5879b243ccb6444e1f45d081e5|fc_0b19c34f7ccbcd5a016aef33ef212887d280f07499c89f3e7b -->

```json
{
  "command": "node report.js",
  "timeout": 30
}
```

<!-- pi:result #call_effaae5879b243ccb6444e1f45d081e5|fc_0b19c34f7ccbcd5a016aef33ef212887d280f07499c89f3e7b -->

```
Total: 65.00
Largest: 40
```

<!-- pi -->

Fixed `report.js`.

It now prints:
```text
Total: 65.00
Largest: 40
```

<!-- you -->

