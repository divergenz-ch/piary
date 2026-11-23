// The caret after a forward delete, in WebKit. CodeMirror writes a changed
// line's text into its text node whole, which by the DOM's rules moves a caret
// in that node to its start. CodeMirror then sets the DOM selection again only
// if the place it wants differs from the one it last read, and forces it only
// in Chrome and on iOS (`@codemirror/view`, `DocView.update`). A forward delete
// wants the caret where it was, so in desktop WebKit, which is the app's
// webview, nothing puts it back: the browser reports the line's start, and the
// editor takes it for a move the user made.
//
// This puts the DOM caret back where the state has it after such a change. It
// compares positions in the document, not nodes, so a caret that is already
// right, in whatever node, is left alone.
import { EditorView } from "@codemirror/view";

export const caretGuard = EditorView.updateListener.of((update) => {
	const view = update.view;
	if (!update.docChanged || !view.hasFocus || view.composing) return;
	const main = update.state.selection.main;
	if (!main.empty) return;
	const dom = view.dom.ownerDocument.getSelection();
	if (!dom || dom.rangeCount === 0 || !dom.isCollapsed || !dom.anchorNode || !view.contentDOM.contains(dom.anchorNode)) return;
	if (view.posAtDOM(dom.anchorNode, dom.anchorOffset) === main.head) return;
	const want = view.domAtPos(main.head);
	dom.collapse(want.node, want.offset);
});
