# ADR 0050 — Commands come from one catalog, and have two ways in

**Status:** accepted (2026-11-16). Which chord a row shows is superseded by
[ADR 0051](0051-a-rows-chord-is-read-from-the-systems-menu.md): it is read from the system's menu, on
any key.

## Context

pi's terminal UI is driven by slash commands. The app's `/` menu listed `/terminal`, `/login` and
whatever this window's pi offered, each as a bare name: what a command did was on a card beside
the list, and pi's own description of it was dropped from the row. Controls the app already had
(the model chip, a new conversation, import, export, settings, sub-agents) had no row, so a user
who came from a terminal agent and typed `/` to find them found nothing. And the menu opens only
on an empty line of the trailing prompt: from the middle of a long conversation there was no way
to the commands without scrolling to its end.

What a command can do once chosen (an extension's dialog, plan mode, pi's `/compact`, `/fork`,
`/clone`) is a separate question and is not decided here.

## Decision

- **One catalog** (`app/command-catalog.ts`, pure): the app's own commands as data, then pi's.
  Every surface that lists commands lists `listCommands`, so two surfaces cannot name or order
  them differently. An app command wins over a pi command of the same name.
- **A row says what its command does**: an icon, the name, and under it one line, the app's from
  the catalog, pi's the first line of its own description. Rows sit under a header saying who
  offers them (Piary, Skills, Prompts, Extensions) and keep the catalog's order, the app's first,
  rather than the alphabet's. The palette's rows carry the same four things.
- **A row shows the chord of its menu item, when the chord is on a letter.** macOS moves a chord
  on punctuation to another key under some keyboard layouts (`⌘,` is `⌘Ö` on a Turkish one). The
  menu bar is drawn by the system and shows the real key; a row is drawn by the page and cannot
  know it, so it shows none rather than a wrong one.
- **The menu has no card beside it.** A row already says what its command does, so a panel
  beside the list only repeated it. A `/name` already written, where no row is on screen, keeps a
  card on hover: the name, what to type after it, one line of what it does and where it comes
  from. It never shows the body of a command's file: a command is learned by running it.
- **A control the app has gets a row, named as pi names it**: `/model`, `/thinking`, `/new`,
  `/resume`, `/import`, `/export`, `/settings`, `/logout`, beside `/terminal`, `/login` and
  `/subagent`. A row that stands for a menu item runs that item through the menu's own route
  (`menuRunner`), so the row and the item cannot drift, and the tour holds both (ADR 0038).
  A row adds no capability: none starts anything the app could not already do.
- **A second way in: Commands… (⌘K) opens a palette** (`app/palette.ts`), a panel over the
  window with a search field over the same catalog. It opens wherever the caret is and leaves the
  document where it was. A row that runs a control runs it; a command that is written (`/subagent`,
  a pi command) is written on the trailing prompt, where the caret then is
  (`DocumentChat.writeAtPrompt`).

## What was tried and not chosen

Each was built on a branch and judged against the alternative.

- **Rows of one line, with no icon, header or chord.** A tester on the real app found every
  command and learned what `/subagent` does from either drawing, and nothing it said separated
  them. The user, shown both, chose the two-line rows. The headers were never exercised by a
  session: none reached the point where pi's rows are listed among the app's.
- **Rows with no description at all**, the name alone with its icon and chord: built by mistake
  for the opposite of what was asked, and not kept. The short line stays; the long text went.
- **⌘K opening the one menu at the trailing prompt** (built on a branch of its own): no second surface,
  the caret is taken to the end of the document and `/` typed there. It moves the reader from
  where they were before they have chosen anything, including for a command that needs no prompt,
  and with the prompt on the window's last line the menu was not on screen at all in the driven
  app. A blind judge of the two from screenshots scored it 2/2/1 against the palette's 4/4/4 for
  clarity, control and keeping one's place.

## Consequences

- A new app command is a row of `APP_COMMANDS`; a new menu item it stands for is named there by
  its id, which the compiler holds to `MENU_IDS`.
- The palette draws a row itself and the `/` menu is CodeMirror's: what they list is one list, how
  a row looks is two pieces of CSS.
- The palette's search reads descriptions too, so `mod` lists `/thinking` under `/model`.
- A terminal the user opens leaves a prompt slot under it. The panel used to take the place of
  the empty prompt at the end, and the next character typed, a `/` included, was stranded
  outside any prompt.
- `/new` and `/resume` open a window of their own, as their menu items do; the list's New session
  button opens in this window. The rows say which.
- The evidence is thin and says so: one test session per arm for the rows, on a driver whose
  typing into a terminal panel does not reach the shell, and screenshots judged by an agent for
  ⌘K, because the session's model calls did not complete. The screen recorder cannot film the `/` menu,
  so its videos were made from driver screenshots.
