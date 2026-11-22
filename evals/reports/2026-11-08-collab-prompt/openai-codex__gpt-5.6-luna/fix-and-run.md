`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool budget #call_d1daef1ae9f9466dbaf865b78c0eee00|fc_018c68d6ba6265d5016aefc35460ac87d2b13e48ff38d98954 -->

```json
{
  "minutes": 2,
  "reason": "Inspect report.js and related files, fix the crash, run it, and report the output."
}
```

<!-- pi:result #call_d1daef1ae9f9466dbaf865b78c0eee00|fc_018c68d6ba6265d5016aefc35460ac87d2b13e48ff38d98954 -->

```
ok — budget 2 min
```

<!-- pi:tool bash #call_8790af12fd2c46d1b15c52956817a787|fc_018c68d6ba6265d5016aefc355c10087d28c6562c4dce57b02 -->

```json
{
  "command": "ls -la && printf '\\n--- report.js ---\\n' && sed -n '1,240p' report.js",
  "timeout": 20
}
```

<!-- pi:tool bash #call_0ec88f70b9e649ebbb17136e3678178d|fc_018c68d6ba6265d5016aefc3574d6087d2be58a52b804c7401 -->

```json
{
  "command": "find . -maxdepth 2 -type f -not -path './.git/*' -print",
  "timeout": 20
}
```

<!-- pi:result #call_8790af12fd2c46d1b15c52956817a787|fc_018c68d6ba6265d5016aefc355c10087d28c6562c4dce57b02 -->

```
total 8
drwxr-xr-x@ 3 user  staff   96 Nov  8 03:33 .
drwx------@ 5 user  staff  160 Nov  8 03:33 ..
-rw-r--r--@ 1 user  staff  302 Nov  8 03:33 report.js

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

<!-- pi:result #call_0ec88f70b9e649ebbb17136e3678178d|fc_018c68d6ba6265d5016aefc3574d6087d2be58a52b804c7401 -->

```
./report.js
```

<!-- pi:tool edit #call_aa9b757ebfe04e548b3519c940e130f7|fc_018c68d6ba6265d5016aefc358560487d289f8cdbed145451f -->

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

<!-- pi:result #call_aa9b757ebfe04e548b3519c940e130f7|fc_018c68d6ba6265d5016aefc358560487d289f8cdbed145451f -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_28db6d56fd724b2da3cc34242a3e7207|fc_018c68d6ba6265d5016aefc35a2b1887d2a4cead59b726cd11 -->

```json
{
  "command": "node report.js",
  "timeout": 20
}
```

<!-- pi:result #call_28db6d56fd724b2da3cc34242a3e7207|fc_018c68d6ba6265d5016aefc35a2b1887d2a4cead59b726cd11 -->

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

