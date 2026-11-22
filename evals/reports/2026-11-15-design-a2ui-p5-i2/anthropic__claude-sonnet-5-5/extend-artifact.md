---
pi: v1
session: eval-extend-artifact
---

Make me a small savings calculator.

<!-- pi -->

A calculator in two cells: the inputs, then the result.

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
monthly = 500
```

<!-- pi:cell js #r3su1t -->

```js
html`<p>After 10 years: <strong>${(monthly * 12 * 10).toLocaleString()}</strong></p>`
```

<!-- you -->

Turn the monthly amount into a slider from 100 to 2000.

<!-- pi:thinking -->

I'm thinking about whether to read the skill first, since I need to understand how controls work inside cells. I'll look at the skill quickly to get that.

<!-- pi:tool bash #toolu_011kETf3Uqdzn2gnawxMAMSP -->

```json
{
  "command": "grep -n -i -B2 -A12 \"slider\\|Inputs\\.\\|view(\" <repo>/pi-extension/SKILL.md | head -120",
  "timeout": 10
}
```

<!-- pi:result #toolu_011kETf3Uqdzn2gnawxMAMSP -->

````
1----
2-name: view-templates
3:description: Read before calling `cell`, `canvas_edit` or `view` — the semantics of reactive code cells (what parses, how controls and state work), how `canvas_edit` changes prose already in the document, the payload schemas of the view templates (diff, file-tree, table, cards, matches, properties), and how to compose an `a2ui` answer to look at (stat tiles, decision matrices, charts, explainers whose sliders recompute).
4----
5-
6-# View templates
7-
8:`view(template, data)` renders `data` as a widget block in the Piary
9-document. The call is the artifact — it computes nothing and returns `ok`.
10-In any other markdown renderer the block degrades to a plain JSON code
11-fence, so only send data that also reads as JSON.
12-
13-Pick the template whose shape fits; a payload that does not fit is refused
14-with the reason, so match the shapes below exactly. An answer to look at is
15-`a2ui` (below); the others show data as it is.
16-
17-## diff — unified line diff
18-
19-```json
20-{ "file": "optional/path.ts", "oldText": "before\n…", "newText": "after\n…" }
--
103-  when it is more than arithmetic you are sure of.
104-- **Explainer** (compound interest, a loan): the inputs in `dataModel`, a
105:  `Slider` per input bound to it, `Stat`s whose `value` is a `calc`, a Chart
106-  or Table whose data is a `series` over the same paths, its `to` bound to
107:  the slider it runs to. Everything follows the sliders with no code. Give a slider a sensible `max` and `steps` (the
108-  number of divisions: 0–15 in 0.5s is `steps: 30`).
109-
110-Rules a payload is refused for, one fault per refusal: an id with a hyphen;
111-a child id that no component has; a prop the component does not take (no
112:`color`, `style`, `variant: "h1"`); `good: null`; a Slider without `max`;
113-`Card` with `children` (it takes one `child`); ChoicePicker `value` not a list
114-of strings. A refusal names the fault at a JSON pointer
115-(`/components/3/good`): fix that one and call again.
116-
117-A cell is the fallback, for what a surface cannot do: data read from a
118-workspace file (`FileAttachment`), a calculation the user asked to see or edit
119-as code, a drawing, a simulation or an animation, and any change to an
120-existing cell.
121-
122-# Reactive cells
123-
124-`cell(source, mode?, id?, group?)` writes a live code cell into the document. The
--
161-- Reference other cells' names directly — no imports between cells. The
162-  runtime tracks dependencies and re-runs in topological order.
163:- `view(…)` wraps an input into a value: `const gain = view(Inputs.range([0, 10]))`
164:  renders a slider and gives dependents the live number.
165-- Interactive state belongs in the dataflow graph, not in DOM listeners:
166:  route it through `view()` (or a cell that re-exports it) so other cells,
167-  the host, and the agent can read it. A widget that keeps its state in raw
168-  DOM event handlers is invisible to everyone but the user's eyes.
169:  `view()`-routed state also survives reloads: the host persists it in the
170-  session transcript and restores it into the widgets on boot — you never
171-  write or read that yourself.
172-- State with no widget — a game board, a canvas, a drawing, anything the
173-  user changes by clicking your own DOM — goes through `state`, which is a
174:  `view()` that renders nothing:
175-
176-  ```js
177:  const board = view(state("board", Array(9).fill(null)));   // reactive, persisted
178-  ```
179-
180-  ```js
181-  setState("board", next);   // write from an event handler or another cell
182-  ```
183-
184-  Dependents re-run on every `setState`, and the value is restored *before*
185-  the first paint on reload, so the artifact comes back as the user left it
186-  rather than flashing its default. Pick a key per artifact concern
187-  (`"board"`, `"turn"`), not per cell. Without this, everything the user did
188-  is gone on reload — the single most common complaint about a cell that
189-  keeps its state in a closure.
--
258-simulation, a drawing, a chart from a file) comes with controls for what they are
259-likely to change next: a range, a count, a colour, a speed, a threshold. Each
260:is its own `view(Inputs.*)` cell in the artifact's group, and its default draws
261-exactly what was asked:
262-
263-```js
264:const turns = view(Inputs.range([1, 20], {label: "Turns", step: 1, value: 6}))
265-```
266-
267-A few controls that matter beat one per constant. When a request changes a
268-property ("make it red", "thicker"), put that property on a control whose
269:default is the value asked for (`Inputs.color({label: "Colour", value: "#ff0000"})`)
270-rather than writing the value into the drawing, because the next request is
271-usually "a bit less".
272-
273-**Keep what the user set.** A control the user has moved keeps their value
274-when you redefine its cell, as long as the new definition declares the same
275-name. A changed range or label keeps it, but a renamed control starts again
276-from its default. So change the cell the request is about, and when a
277-control must change, keep its export name. Values set through
278-`state(key, …)` survive a redefinition the same way, by key. A prompt that opens
279-with `[cell values] {…}` carries what the user has set right now, by export
280-name. Read it before you change a control, and keep those values unless you
281-are asked to change them.
--
283-Use a cell when the result must run code (a file to read, a drawing, a
284-simulation, a calculation shown as code); use an `a2ui` view for figures,
285:charts, comparisons and explainers, sliders included; use prose for
286-everything else.
287-
288-## Changing what is already in the document
289-
290-`canvas_edit(oldText, newText)` changes prose already in the conversation — a
291-heading, a paragraph, a list, one of your earlier answers — in place. Quote
292-`oldText` exactly as the document has it, with enough around it to occur
293-once, inside one block; `newText` replaces it. An empty `newText` removes the
294-text; to add after something, repeat it in `newText` and add to it. The open
295-page applies the change and answers `ok`, or why not — not found, found in
296-several places, a cell, more than one block — and a refusal means nothing
297-changed, so requote rather than report it done. The `[now: …]` and `[attached: …]` lines you
````

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
monthly = view(Inputs.range([100, 2000], {label: "Monthly amount", step: 50, value: 500}))
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000 in steps of 50. It starts at 500, and the 10-year total below it updates as you move it.

<!-- you -->

