We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm trying to work out whether the $38k monthly burn means gross or net, and it's ambiguous. I'll assume it's gross expenses, so net burn is $38k minus revenue. I want to run the numbers quickly in a cell with some controls, but first I need to check the skill instructions, since they say to read it before using a cell.

<!-- pi:tool bash #toolu_01U4QpUeCoHfMD7ijDkVijQA -->

```json
{
  "command": "sed -n 1,200p <repo>/pi-extension/SKILL.md | grep -n -i -A25 \"reactive\"| head -80",
  "timeout": 10
}
```

<!-- pi:result #toolu_01U4QpUeCoHfMD7ijDkVijQA -->

````
3:description: Payload schemas for the `view` tool — render data as a visual block (diff, file-tree, table, cards, matches, properties) in the Piary document — semantics for the `cell` tool, which writes reactive code cells that run in the document, and the `canvas_edit` tool, which changes prose already in it. Read before calling `view`, `cell` or `canvas_edit`.
4----
5-
6-# View templates
7-
8-`view(template, data)` renders `data` as a widget block in the Piary
9-document. The call is the artifact — it computes nothing and returns `ok`.
10-In any other markdown renderer the block degrades to a plain JSON code
11-fence, so only send data that also reads as JSON.
12-
13-Pick the template whose shape fits; a payload that does not fit is refused
14-with the reason, so match the shapes below exactly.
15-
16-## diff — unified line diff
17-
18-```json
19-{ "file": "optional/path.ts", "oldText": "before\n…", "newText": "after\n…" }
20-```
21-
22-`oldText` and `newText` required (full multi-line strings); `file` optional.
23-
24-## file-tree — collapsible path tree
25-
26-```json
27-{ "paths": ["src/a.ts", "src/b/c.ts", "README.md"] }
28-```
--
70:# Reactive cells
71-
72-`cell(source, mode?, id?, group?)` writes a live code cell into the document. The
73-call is the cell — it returns `ok` immediately ("written", not "ran"); the
74-code executes in the document's dataflow graph and re-runs whenever a cell
75-it references changes. In any other markdown renderer a cell degrades to a
76-plain code fence.
77-
78-**This is not React.** JSX does not parse, `className` and Tailwind classes do
79-nothing, and there is no component model — a cell is a value, not a component.
80-Build markup with `htl.html` and ordinary `class=`:
81-
82-```js
83-htl.html`<div class="card" style="padding:12px;border-radius:12px;background:#eef">
84-  <h1>${city.name}</h1><p>${temp}°</p>
85-</div>`
86-```
87-
88-Reach for `Plot` for charts and `Inputs` for controls before writing markup at
89-all. A cell written as a React component returns `NOT OK` from this tool and
90-renders nothing.
91-
92-Semantics (Observable notebook style):
93-
94-- Top-level declarations are the cell's exports: `const data = …` defines
95-  `data` for every other cell. A bare expression displays its value.
--
124:  const board = view(state("board", Array(9).fill(null)));   // reactive, persisted
125-  ```
126-
127-  ```js
128-  setState("board", next);   // write from an event handler or another cell
129-  ```
130-
131-  Dependents re-run on every `setState`, and the value is restored *before*
132-  the first paint on reload, so the artifact comes back as the user left it
133-  rather than flashing its default. Pick a key per artifact concern
134-  (`"board"`, `"turn"`), not per cell. Without this, everything the user did
135-  is gone on reload — the single most common complaint about a cell that
136-  keeps its state in a closure.
137-- When a user's change should become document text — a checklist's checked
138-  items, a constant the user scrubbed in a program — dispatch
139-  `dispatchEvent(new CustomEvent("pi-cell-writeback", {detail: {id, source}}))`
140-  to replace cell `id`'s source in the document.  An unchanged source is a
141-  no-op, which is what ends the re-run loop; prefer `state` for values that
142-  do not need to survive as editable document text.
143-- `display(…)` shows extra values; top-level `await` works; generators
144-  yield streams.
145-- Libraries: `d3`, `Plot`, `Inputs`, `htl`, `md`, `tex` are ambient. Import
146-  anything else from npm: `import {mean} from "npm:d3-array"`.
147-- Files: `FileAttachment("data/sales.csv")` reads a workspace file, the path
148-  from the workspace root — `.json()`, `.csv({typed: true})`, `.text()`,
149-  `.arrayBuffer()`. Read data from its file this way rather than copying its
````

<!-- pi:artifact @runway -->

<!-- pi:cell js #qmqqFK -->

```js
const cash = view(Inputs.range([0,1000],{value:480,step:10,label:"Cash ($k)"}));
const burn = view(Inputs.range([0,100],{value:38,step:1,label:"Monthly burn ($k, gross costs)"}));
const rev0 = view(Inputs.range([0,50],{value:12,step:1,label:"Revenue now ($k/mo)"}));
const g = view(Inputs.range([0,0.25],{value:0.08,step:0.01,label:"Growth/mo"}));
```

<!-- pi:cell js #cn5zXv -->

```js
function sim(g,months=60){let c=cash,r=rev0,out=[{m:0,c,g}];for(let m=1;m<=months;m++){r*=1+g;c+=r-burn;out.push({m,c,g});if(c<0){const prev=out[m-1].c;out[m].frac=m-1+prev/(prev-c);break}}return out}
const rates=[0.05,g,0.12].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
const runs=rates.map(x=>({g:x,pts:sim(x)}));
const summary=runs.map(({g,pts})=>{const l=pts.at(-1);return {Growth:(g*100).toFixed(0)+"%",Outcome:l.c<0?`Out of cash in month ${l.frac.toFixed(1)}`:"Not within 60 months (cash still positive)"}});
display(Inputs.table(summary));
display(Plot.plot({y:{label:"Cash ($k)",grid:true},x:{label:"Month"},color:{legend:true},marks:[Plot.ruleY([0]),Plot.line(runs.flatMap(r=>r.pts.map(p=>({...p,g:(r.g*100).toFixed(0)+"%"}))),{x:"m",y:"c",stroke:"g"})]}))
```

<!-- pi -->

Quick check of the numbers:

<!-- pi:tool bash #toolu_01DkUr3g8DpXF8YYbQbkRXGG -->

```json
{
  "command": "python3 -c \"\nfor g in(.05,.08,.12):\n  c=480;r=12\n  for m in range(1,61):\n    r*=1+g;p=c;c+=r-38\n    if c<0:print(g,m,round(m-1+p/(p-c),1));break\n  else:print(g,'none',round(c),round(r,1))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01DkUr3g8DpXF8YYbQbkRXGG -->

```
0.05 none 2655 224.2
0.08 none 14442 1215.1
0.12 none 98619 10771.2
```

<!-- pi:thinking -->

I'm checking whether the cash runs out: at 8% growth, revenue passes 38 around month 15. Next I need to confirm cash stays positive and find the minimum cash balance and the breakeven month.

<!-- pi:tool bash #toolu_01EEv63kYTNPCn4LFNVzE5Eg -->

```json
{
  "command": "python3 -c \"\nfor g in(.05,.08,.12):\n  c=480;r=12;mn=c;be=None\n  for m in range(1,61):\n    r*=1+g;c+=r-38\n    if be is None and r>=38:be=m\n    mn=min(mn,c)\n    if c==mn:mm=m\n  print(g,be,round(mn),mm)\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01EEv63kYTNPCn4LFNVzE5Eg -->

```
0.05 24 128 23
0.08 15 262 14
0.12 11 336 10
```

<!-- pi -->

**You don't run out of money in any of the three cases**, if the $38k is gross monthly costs and revenue offsets it. The table and chart above show this, and you can change the inputs.

| Growth | Revenue covers costs | Lowest cash |
|---|---|---|
| 5% | month 24 | about $128k (month 23) |
| 8% | month 15 | about $262k (month 14) |
| 12% | month 11 | about $336k (month 10) |

- **Why it holds:** revenue compounds while costs stay flat, so it passes $38k within one to two years. Cash dips and then recovers.
- **If $38k is already net of revenue:** the runway is 480 ÷ 38, about 12.6 months, with growth only stretching that a little. Set the burn control to 38 minus revenue to see it.
- **Assumptions:** costs stay flat at $38k and growth holds at the same rate every month. The 5% case needs growth to hold for two years, which is the weak point.

<!-- you -->

