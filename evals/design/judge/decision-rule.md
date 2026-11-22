# Decision rule (written 2026-11-15 before any verdict beyond the one smoke call was read)

- Unit: 18 pairs per arm pair (6 cases x 3 reps), each judged in both A/B orders. Same pick in both
  orders = a win; a flip = a tie (half a win each in the win rate).
- Only 6 independent cases. A win rate is called distinguishable from a coin flip only at >= 14/18
  decisive wins for one side (two-sided sign test p ~ 0.03 on 18; looser with ties excluded).
- If self-made vs A2UI falls inside that band (neither has >= 14/18 and the contact-sheet rank does
  not separate them clearly), quality is called a tie and the cost facts decide: runtime deps (A2UI
  +3 direct / +10 transitive, needs approval), bundle (+17% vs +0.47%), guidance size (~+9k vs
  ~+2.5k chars), the system-prompt line A2UI needed, code to maintain. On a quality tie those favour
  self-made.
- If A2UI wins >= 14/18 against self-made AND its sheet ranks above self-made's, A2UI is recommended
  despite the costs, with dependency approval and an ADR as conditions.
- Mirror: if self-made wins >= 14/18, self-made is recommended.
- Reported alongside: per-case results, flip (tie) rate, share of "A" picks (position bias), rubric
  yes-rates with n (each image gets 4 rubric readings: 2 pairs x 2 orders).
