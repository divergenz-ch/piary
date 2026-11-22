`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool bash #call_e6372b2c950f47f9a576c4cbce902f27|fc_04f513f276269046016aef342a234887d2b42b1e4b28785f78 -->

```json
{
  "command": "ls -la && printf '\\n--- report.js ---\\n' && sed -n '1,240p' report.js 2>/dev/null || true && printf '\\n--- package ---\\n' && cat package.json 2>/dev/null || true",
  "timeout": 10
}
```

<!-- pi:result #call_e6372b2c950f47f9a576c4cbce902f27|fc_04f513f276269046016aef342a234887d2b42b1e4b28785f78 -->

```
total 8
drwxr-xr-x@ 3 user  staff   96 Nov  7 17:22 .
drwx------@ 5 user  staff  160 Nov  7 17:22 ..
-rw-r--r--@ 1 user  staff  302 Nov  7 17:22 report.js

--- report.js ---
const orders = [
	{ id: 1, amount: 40 },
	{ id: 2, amount: 25 },
];

const total = orders.reduce((sum, order) => sum + order.ammount, 0);
console.log(`Total: ${total.toFixed(2)}`);
console.log(`Largest: ${Math.max(...orders.map((o) => o.amount))}`);
throw new Error("unreachable" + undefinedVariable);

--- package ---
```

<!-- pi:tool edit #call_f372571fa9bc4b82ac631742c0d7f34f|fc_04f513f276269046016aef342c538c87d29066236a9779a7e4 -->

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

<!-- pi:result #call_f372571fa9bc4b82ac631742c0d7f34f|fc_04f513f276269046016aef342c538c87d29066236a9779a7e4 -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_ad120eb323ca4f68bcbe127a083eb3c3|fc_04f513f276269046016aef342e11a487d2943f8db43698b417 -->

```json
{
  "command": "node report.js",
  "timeout": 10
}
```

<!-- pi:result #call_ad120eb323ca4f68bcbe127a083eb3c3|fc_04f513f276269046016aef342e11a487d2943f8db43698b417 -->

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

