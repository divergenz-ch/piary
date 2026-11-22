// Where the reader is left standing after the document changes under them.
//
// These three lived in `tests/integration/editor.test.ts`, asserted through a stand-in for
// `view.dispatch`: `spec.scrollIntoView`, `spec.effects === undefined`, and the
// scroll effect's `value.range.head`. That reads CodeMirror's instruction rather
// than the outcome, so it failed when CodeMirror renamed an internal field and
// passed when it changed how an instruction is honoured — backwards for a
// regression test. The in-test comment admitted as much ("CodeMirror-internal").
//
// jsdom could not fix it: with no layout there is no scroll position to look at.
// Here there is, so each spec asserts where the viewport actually ended up.
import { expect, test } from "@playwright/test";
import { afterFrames } from "./helpers/frames.ts";

/** Long enough to scroll: the reader's place is only observable if there is
 *  somewhere else they could have been put. */
const LONG = (() => {
  const filler = (tag: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}`).join("\n\n");
  return [
    "<!-- you -->",
    "",
    "chart it",
    "",
    filler("intro", 25),
    "",
    "<!-- pi -->",
    "",
    "here you go",
    "",
    filler("answer", 25),
    "",
    "<!-- you -->",
    "",
    "",
  ].join("\n");
})();

async function open(page: import("@playwright/test").Page, md: string) {
  await page.goto(`/demo/harness.html?doc=${encodeURIComponent(md)}`);
  await expect(page.locator(".cm-line").first()).toBeVisible();
}

const scrollTop = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.querySelector(".cm-scroller")!.scrollTop);

/** Drive the canvas's own API, the way its host does. */
async function call(page: import("@playwright/test").Page, fn: string, ...args: unknown[]) {
  await page.evaluate(
    ([name, rest]) => {
      const el = document.querySelector("document-chat") as unknown as Record<string, (...a: unknown[]) => unknown>;
      el[name as string]!(...(rest as unknown[]));
    },
    [fn, args] as [string, unknown[]],
  );
}

test("a structural edit holds the reader's place instead of chasing the caret", async ({ page }) => {
  await open(page, LONG);
  // Put the reader in the middle, where a jump to either end is visible.
  await page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller")!;
    scroller.scrollTop = Math.floor((scroller.scrollHeight - scroller.clientHeight) / 2);
  });
  const before = await scrollTop(page);
  expect(before).toBeGreaterThan(0);

  // Replace the document with one line of it removed — the shape a segment
  // delete produces. The caret sits at the tail; the reader does not.
  await page.evaluate(() => {
    const el = document.querySelector("document-chat") as unknown as {
      getDocument(): string;
      replaceDocument(md: string): void;
    };
    el.replaceDocument(el.getDocument().replace("answer line 3\n\n", ""));
  });
  await afterFrames(page);

  // The assertion jsdom could not make: not "no scroll instruction was issued",
  // but "the reader is still roughly where they were".
  const after = await scrollTop(page);
  expect(Math.abs(after - before)).toBeLessThan(60);
});

test("an edit that moves the caret brings the caret into view", async ({ page }) => {
  await open(page, LONG);
  // Start at the top; the caret is about to be put at the very end.
  await page.evaluate(() => void (document.querySelector(".cm-scroller")!.scrollTop = 0));
  expect(await scrollTop(page)).toBe(0);

  await page.evaluate(() => {
    const el = document.querySelector("document-chat") as unknown as {
      edit(resolve: (md: string) => { changes: { from: number; insert: string }; caret: number }): void;
    };
    el.edit((md) => ({ changes: { from: md.length, insert: "typed" }, caret: md.length + 5 }));
  });
  await afterFrames(page);

  // The writer follows their own caret, which is the opposite case to the spec
  // above and the reason both have to be asserted.
  expect(await scrollTop(page)).toBeGreaterThan(0);
  await expect(page.locator(".cm-line", { hasText: "typed" })).toBeVisible();
});

test("loading a document lands the reader at the top, with the caret at the tail", async ({ page }) => {
  await open(page, "<!-- you -->\n\nshort\n");
  await call(page, "setDocument", LONG);
  await afterFrames(page);

  // The caret is not the reader. Following it to the tail put a reader
  // mid-page once the artifacts above had measured in — so the load asks for
  // the top explicitly.
  //
  // Not exactly 0: the request carries `yMargin: 48`, so the top of the
  // document sits just below the top of the scroller. Asserting 0 here would
  // be asserting the instruction again, by a different route — what matters is
  // that the reader is at the head of a document 2000+ pixels tall, not at the
  // tail where the caret went.
  const top = await scrollTop(page);
  const max = await page.evaluate(() => {
    const s = document.querySelector(".cm-scroller")!;
    return s.scrollHeight - s.clientHeight;
  });
  expect(max).toBeGreaterThan(500);
  expect(top).toBeLessThan(100);
  await expect(page.locator(".cm-line").first()).toBeInViewport();

  // …and typing still lands in the trailing prompt, which is where the caret
  // was left even though the viewport did not go there.
  const caret = await page.evaluate(() => {
    const el = document.querySelector("document-chat") as unknown as {
      view: { state: { selection: { main: { head: number } }; doc: { length: number } } };
    };
    return { head: el.view.state.selection.main.head, length: el.view.state.doc.length };
  });
  expect(caret.head).toBe(caret.length);
});
