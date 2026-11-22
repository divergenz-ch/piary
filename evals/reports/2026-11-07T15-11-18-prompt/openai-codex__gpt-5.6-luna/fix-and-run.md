`node report.js` crashes. Make it run, and tell me what it prints.

<!-- pi:tool bash #call_85d61e8a2a7f41e098cd9212ca1514f1|fc_06c1531512429899016aef3fb597f887d2b2ca541a0f5aef4f -->

```json
{
  "command": "ls -la && printf '\\n--- report.js ---\\n' && (test -f report.js && sed -n '1,240p' report.js || true) && printf '\\n--- package files ---\\n' && find . -maxdepth 2 -type f -not -path './.git/*' -print",
  "timeout": 10
}
```

<!-- pi:result #call_85d61e8a2a7f41e098cd9212ca1514f1|fc_06c1531512429899016aef3fb597f887d2b2ca541a0f5aef4f -->

```
total 8
drwxr-xr-x@ 3 user  staff   96 Nov  7 18:11 .
drwx------@ 5 user  staff  160 Nov  7 18:11 ..
-rw-r--r--@ 1 user  staff  302 Nov  7 18:11 report.js

--- report.js ---
const orders = [
	{ id: 1, amount: 40 },
	{ id: 2, amount: 25 },
];

const total = orders.reduce((sum, order) => sum + order.ammount, 0);
console.log(`Total: ${total.toFixed(2)}`);
console.log(`Largest: ${Math.max(...orders.map((o) => o.amount))}`);
throw new Error("unreachable" + undefinedVariable);

--- package files ---
./report.js
```

<!-- pi:tool edit #call_4d717393de7e40ffbfe5838bc3fbd223|fc_06c1531512429899016aef3fb8170087d2b125ecfceed2cef5 -->

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

<!-- pi:result #call_4d717393de7e40ffbfe5838bc3fbd223|fc_06c1531512429899016aef3fb8170087d2b125ecfceed2cef5 -->

```
Successfully replaced 2 block(s) in report.js.
```

<!-- pi:tool bash #call_ad5f334ad9104263b4d2e2e4451a53ce|fc_06c1531512429899016aef3fb9fd8087d2a624344d6db41da6 -->

```json
{
  "command": "node report.js",
  "timeout": 10
}
```

<!-- pi:result #call_ad5f334ad9104263b4d2e2e4451a53ce|fc_06c1531512429899016aef3fb9fd8087d2a624344d6db41da6 -->

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

