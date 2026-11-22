`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool budget #call_998e2fd6c1684740adbba5776e0528d0|fc_05518b7d91498180016af87127008487d2a5b83c39e76dd551 -->

```json
{
  "minutes": 2,
  "reason": "Inspect report.js, fix the crash, run it, and verify the output."
}
```

<!-- pi:result #call_998e2fd6c1684740adbba5776e0528d0|fc_05518b7d91498180016af87127008487d2a5b83c39e76dd551 -->

```
ok — budget 2 min
```

<!-- pi:tool bash #call_643211c8bc7f4c97a1054873b13b7a14|fc_05518b7d91498180016af87128970087d28552600b955de9cb -->

```json
{
  "command": "ls -la && printf '\\n--- report.js ---\\n' && node -p \"require('fs').readFileSync('report.js','utf8')\"",
  "timeout": 20
}
```

<!-- pi:tool bash #call_a67fd93ee6364980b9e0d5cce5382f43|fc_05518b7d91498180016af8712a483887d2908db462fe17449c -->

```json
{
  "command": "find . -maxdepth 2 -type f -not -path './.git/*' -print",
  "timeout": 20
}
```

<!-- pi:result #call_643211c8bc7f4c97a1054873b13b7a14|fc_05518b7d91498180016af87128970087d28552600b955de9cb -->

```
total 8
drwxr-xr-x@ 3 user  staff   96 Nov 14 17:33 .
drwx------@ 6 user  staff  192 Nov 14 17:33 ..
-rw-r--r--@ 1 user  staff  302 Nov 14 17:33 report.js

--- report.js ---
const orders = [
	{ id: 1, amount: 40 },
	{ id: 2, amount: 25 },
];

const total = orders.reduce((sum, order) => sum + order.ammount, 0);
console.log(`Total: ${total.toFixed(2)}`);
console.log(`Largest: ${Math.max(...orders.map((o) => o.amount))}`);
throw new Error("unreachable" + undefinedVariable);
```

<!-- pi:result #call_a67fd93ee6364980b9e0d5cce5382f43|fc_05518b7d91498180016af8712a483887d2908db462fe17449c -->

```
./report.js
```

<!-- pi:tool edit #call_a0cfe2d41203486fac3a94a1c77eccd4|fc_05518b7d91498180016af8712c349487d29330ecb5dd68569b -->

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

<!-- pi:result #call_a0cfe2d41203486fac3a94a1c77eccd4|fc_05518b7d91498180016af8712c349487d29330ecb5dd68569b -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_02caf276e5ed4e78909719ed0a4de859|fc_05518b7d91498180016af8712e12a887d2962836dab4329075 -->

```json
{
  "command": "node report.js",
  "timeout": 20
}
```

<!-- pi:result #call_02caf276e5ed4e78909719ed0a4de859|fc_05518b7d91498180016af8712e12a887d2962836dab4329075 -->

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

