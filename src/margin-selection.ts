import type { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Plugin } from "obsidian";

const BLOCK_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s?|#{1,6}\s+\S|\|)/;
const HOVER_CLASS = "checklist-flow-margin-hover";
const SELECTING_CLASS = "checklist-flow-margin-selecting";

interface BlockRange { from: number; to: number }

export function paragraphRange(doc: Text, offset: number): BlockRange {
  const clicked = doc.lineAt(offset);
  const blocked = (text: string) => text.trim() === "" || BLOCK_RE.test(text);
  // Lists, headings, quotes, table rows and empty lines are standalone units.
  if (blocked(clicked.text)) return { from: clicked.from, to: clicked.to };
  let start = clicked.number;
  let end = start;
  while (start > 1 && !blocked(doc.line(start - 1).text)) start--;
  while (end < doc.lines && !blocked(doc.line(end + 1).text)) end++;
  return { from: doc.line(start).from, to: doc.line(end).to };
}

export function extendBlockSelection(origin: BlockRange, target: BlockRange) {
  return target.from < origin.from
    ? { anchor: origin.to, head: target.from }
    : { anchor: origin.from, head: Math.max(origin.to, target.to) };
}

function lineInLeftMargin(view: EditorView, event: MouseEvent) {
  const target = event.target as Element | null;
  if (target?.closest?.("input, button, a, .cm-gutters, .collapse-indicator, .cm-fold-indicator")) return null;
  const rect = view.scrollDOM.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX >= rect.right ||
      event.clientY < rect.top || event.clientY >= rect.bottom) return null;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return null;
  const line = view.state.doc.lineAt(pos);
  const coords = view.coordsAtPos(line.from);
  if (!coords || event.clientY < coords.top - 2 || event.clientY > coords.bottom + 2 ||
      event.clientX >= coords.left - 4) return null;
  return line;
}

// Listen on each editor's actual document: Obsidian may host editors in
// separate documents, and its internal CodeMirror module can differ from ours.
export function registerMarginSelection(plugin: Plugin) {
  let hovered: HTMLElement | null = null;
  let endGesture: (() => void) | null = null;
  let clickGuard: { host: HTMLElement; until: number } | null = null;
  const clearHover = () => {
    hovered?.classList.remove(HOVER_CLASS);
    hovered = null;
  };
  const findView = (event: Event): EditorView | null => {
    const host = (event.target as Element | null)?.closest?.(".cm-editor");
    if (!host) return null;
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const editor = (leaf.view as unknown as { editor?: { cm?: EditorView } }).editor;
      if (editor?.cm?.dom === host) return editor.cm;
    }
    return null;
  };
  const onHover = (event: PointerEvent) => {
    if (endGesture) return;
    clearHover();
    if (event.pointerType !== "mouse") return;
    const view = findView(event);
    if (view && lineInLeftMargin(view, event)) {
      hovered = view.dom;
      hovered.classList.add(HOVER_CLASS);
    }
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.pointerType !== "mouse") return;
    endGesture?.();
    clickGuard = null;
    const view = findView(event);
    if (!view) return;
    const line = lineInLeftMargin(view, event);
    const win = view.dom.ownerDocument.defaultView;
    if (!line || !win) return;
    event.preventDefault();
    event.stopPropagation();
    clearHover();
    const doc = view.state.doc;
    const origin = paragraphRange(doc, line.from);
    let frame = 0;
    let clientX = event.clientX;
    let clientY = event.clientY;
    let moved = false;
    const select = (target: BlockRange) => {
      const selection = extendBlockSelection(origin, target);
      const current = view.state.selection.main;
      if (current.anchor !== selection.anchor || current.head !== selection.head) {
        view.dispatch({ selection, scrollIntoView: false, userEvent: "select.pointer" });
      }
    };
    const valid = () => view.dom.isConnected && view.state.doc === doc;
    const updateSelection = () => {
      if (!valid()) { finish(); return; }
      const rect = view.scrollDOM.getBoundingClientRect();
      const content = view.contentDOM.getBoundingClientRect();
      const x = Math.max(rect.left + 1, Math.min(content.left + 1, rect.right - 1));
      const y = Math.max(rect.top + 1, Math.min(clientY, rect.bottom - 1));
      const pos = view.posAtCoords({ x, y }, false);
      if (pos !== null) select(paragraphRange(doc, pos));
    };
    const autoScroll = () => {
      frame = 0;
      if (!valid()) { finish(); return; }
      const rect = view.scrollDOM.getBoundingClientRect();
      const edge = Math.min(32, rect.height / 4);
      const delta = clientY < rect.top + edge ? -Math.min(20, (rect.top + edge - clientY) / 2)
        : clientY > rect.bottom - edge ? Math.min(20, (clientY - rect.bottom + edge) / 2) : 0;
      if (!delta) return;
      const before = view.scrollDOM.scrollTop;
      view.scrollDOM.scrollTop += delta;
      updateSelection();
      if (endGesture && view.scrollDOM.scrollTop !== before) frame = win.requestAnimationFrame(autoScroll);
    };
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== event.pointerId) return;
      if (!(move.buttons & 1)) { finish(); return; }
      move.preventDefault();
      move.stopPropagation();
      clientX = move.clientX;
      clientY = move.clientY;
      moved ||= Math.hypot(clientX - event.clientX, clientY - event.clientY) >= 3;
      if (!moved) return;
      updateSelection();
      if (endGesture && !frame) frame = win.requestAnimationFrame(autoScroll);
    };
    const onUp = (up: PointerEvent) => {
      if (up.pointerId !== event.pointerId) return;
      up.preventDefault();
      up.stopPropagation();
      finish();
    };
    const onKey = (key: KeyboardEvent) => { if (key.key === "Escape") finish(); };
    const onSelectStart = (selectEvent: Event) => selectEvent.preventDefault();
    const onScroll = () => { if (moved) updateSelection(); };
    const finish = () => {
      win.cancelAnimationFrame(frame);
      win.removeEventListener("pointermove", onMove, true);
      win.removeEventListener("pointerup", onUp, true);
      win.removeEventListener("pointercancel", onUp, true);
      win.removeEventListener("blur", finish);
      win.removeEventListener("keydown", onKey, true);
      win.removeEventListener("selectstart", onSelectStart, true);
      view.scrollDOM.removeEventListener("scroll", onScroll);
      view.dom.classList.remove(SELECTING_CLASS);
      clickGuard = { host: view.dom, until: Date.now() + 250 };
      endGesture = null;
    };
    endGesture = finish;
    view.dom.classList.add(SELECTING_CLASS);
    view.focus();
    select(origin);
    win.addEventListener("pointermove", onMove, true);
    win.addEventListener("pointerup", onUp, true);
    win.addEventListener("pointercancel", onUp, true);
    win.addEventListener("blur", finish);
    win.addEventListener("keydown", onKey, true);
    win.addEventListener("selectstart", onSelectStart, true);
    view.scrollDOM.addEventListener("scroll", onScroll);
  };

  const docs = new Set<Document>();
  const syncDocs = () => {
    const currentDocs = [document];
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const editor = (leaf.view as unknown as { editor?: { cm?: EditorView } }).editor;
      if (editor?.cm) currentDocs.push(editor.cm.dom.ownerDocument);
    }
    for (const doc of currentDocs) {
      if (docs.has(doc)) continue;
      docs.add(doc);
      plugin.registerDomEvent(doc, "pointerdown", onDown, true);
      plugin.registerDomEvent(doc, "pointermove", onHover, true);
      plugin.registerDomEvent(doc, "pointerleave", clearHover);
      plugin.registerDomEvent(doc, "click", (event: MouseEvent) => {
        if (!clickGuard || Date.now() > clickGuard.until) return;
        const target = event.target as Node | null;
        if (target && clickGuard.host.contains(target)) {
          event.preventDefault();
          event.stopPropagation();
          clickGuard = null;
        }
      }, true);
      if (doc.defaultView) plugin.registerDomEvent(doc.defaultView, "blur", clearHover);
    }
  };
  plugin.registerEvent(plugin.app.workspace.on("layout-change", syncDocs));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", syncDocs));
  syncDocs();
  plugin.register(() => { endGesture?.(); clearHover(); docs.clear(); clickGuard = null; });
}
