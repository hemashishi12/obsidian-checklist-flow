import { EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type ChecklistFlowPlugin from "./main";
import {
  findListStartLineAtOrAbove,
  findTaskStartLineAtOrAbove,
  getOrderedListMarkerLength,
  getSiblingListLineIndexes,
  getSiblingTaskLineIndexes,
  moveListBlock,
  moveTaskBlock,
  sortChecklistEditAtLine,
  taskStatusChanged,
} from "./checklist";

const POINTER_DRAG_THRESHOLD = 6;
const SUPPRESS_CLICK_MS = 250;

interface DragState {
  highlight: HTMLElement;
  indicator: HTMLElement;
  lineIndex: number;
  kind: DragKind;
  removeHighlightScrollListener: () => void;
  view: EditorView;
}

type DragKind = "checkbox" | "number";

interface PendingDrag {
  lineIndex: number;
  kind: DragKind;
  pointerId: number;
  removeListeners: () => void;
  startX: number;
  startY: number;
  view: EditorView;
}

export function createChecklistFlowExtension(plugin: ChecklistFlowPlugin) {
  const viewPlugin = ViewPlugin.fromClass(
    class ChecklistFlowViewPlugin implements PluginValue {
      private cleanup: Array<() => void> = [];
      private pendingDrag: PendingDrag | null = null;
      private sinkTimer: number | null = null;

      constructor(private readonly view: EditorView) {
        this.syncViewClass();
        this.attachPointerHandlers();
      }

      update(update: ViewUpdate) {
        this.syncViewClass();
        if (update.docChanged && plugin.settings.autoSinkCompleted && this.updateContainsTaskStatusChange(update)) {
          this.scheduleAutoSink(update);
        }
      }

      destroy() {
        if (this.sinkTimer !== null) {
          window.clearTimeout(this.sinkTimer);
        }
        this.clearPendingDrag();
        clearDragState(plugin);
        this.cleanup.forEach((clean) => clean());
        this.view.dom.classList.remove("checklist-flow-checkbox-drag-enabled", "checklist-flow-dragging");
      }

      private attachPointerHandlers() {
        const scroller = this.view.scrollDOM;

        const onClick = (event: MouseEvent) => {
          if (plugin.suppressNextNumberClick) {
            plugin.suppressNextNumberClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
          }

          if (!plugin.suppressNextCheckboxClick || !getTaskCheckbox(event.target)) {
            return;
          }
          plugin.suppressNextCheckboxClick = false;
          event.preventDefault();
          event.stopPropagation();
        };

        const onPointerDown = (event: PointerEvent) => {
          if (!plugin.settings.enableDragHandles || event.button !== 0) {
            return;
          }

          const checkbox = getTaskCheckbox(event.target);
          if (checkbox) {
            event.preventDefault();
            event.stopPropagation();
            const lineIndex = getTaskLineIndexFromElement(this.view, checkbox);
            if (lineIndex === null) {
              return;
            }

            const taskLineIndex = findTaskStartLineAtOrAbove(this.view.state.doc.toString(), lineIndex);
            if (taskLineIndex === null) {
              return;
            }

            this.clearPendingDrag();
            this.pendingDrag = createPendingDrag(plugin, this.view, taskLineIndex, "checkbox", event, () =>
              this.clearPendingDrag(),
            );
            return;
          }

          const numberLineIndex = getOrderedNumberLineIndexAtPoint(this.view, event);
          if (numberLineIndex === null) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          this.clearPendingDrag();
          this.pendingDrag = createPendingDrag(plugin, this.view, numberLineIndex, "number", event, () =>
            this.clearPendingDrag(),
          );
        };

        const onDragStart = (event: DragEvent) => {
          if (!this.pendingDrag && !plugin.dragState && !getTaskCheckbox(event.target)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
        };

        scroller.addEventListener("click", onClick, true);
        scroller.addEventListener("pointerdown", onPointerDown, true);
        scroller.addEventListener("dragstart", onDragStart, true);
        this.cleanup.push(() => {
          scroller.removeEventListener("click", onClick, true);
          scroller.removeEventListener("pointerdown", onPointerDown, true);
          scroller.removeEventListener("dragstart", onDragStart, true);
        });
      }

      private clearPendingDrag() {
        this.pendingDrag?.removeListeners();
        this.pendingDrag = null;
      }

      private updateContainsTaskStatusChange(update: ViewUpdate): boolean {
        let changed = false;
        update.changes.iterChanges((fromA, _toA, fromB) => {
          if (changed) {
            return;
          }
          const beforeLine = update.startState.doc.lineAt(Math.min(fromA, update.startState.doc.length)).text;
          const afterLine = update.state.doc.lineAt(Math.min(fromB, update.state.doc.length)).text;
          changed = taskStatusChanged(beforeLine, afterLine);
        });
        return changed;
      }

      private scheduleAutoSink(update: ViewUpdate) {
        if (this.sinkTimer !== null) {
          window.clearTimeout(this.sinkTimer);
        }

        const changedLines: number[] = [];
        update.changes.iterChanges((_fromA, _toA, fromB) => {
          changedLines.push(update.state.doc.lineAt(Math.min(fromB, update.state.doc.length)).number - 1);
        });

        this.sinkTimer = window.setTimeout(() => {
          this.sinkTimer = null;
          const text = this.view.state.doc.toString();
          const lineIndex = changedLines[changedLines.length - 1];
          const edit = sortChecklistEditAtLine(text, lineIndex, plugin.settings);

          if (edit.changed) {
            dispatchPreservingScroll(this.view, {
              from: edit.from,
              insert: edit.insert,
              to: edit.to,
            });
          }
        }, 150);
      }

      private syncViewClass() {
        this.view.dom.classList.toggle("checklist-flow-checkbox-drag-enabled", plugin.settings.enableDragHandles);
      }
    },
  );

  return [viewPlugin];
}

function createPendingDrag(
  plugin: ChecklistFlowPlugin,
  view: EditorView,
  lineIndex: number,
  kind: DragKind,
  event: PointerEvent,
  onDone: () => void,
): PendingDrag {
  const ownerWindow = view.dom.ownerDocument.defaultView ?? window;
  const pending: PendingDrag = {
    lineIndex,
    kind,
    pointerId: event.pointerId,
    removeListeners: () => undefined,
    startX: event.clientX,
    startY: event.clientY,
    view,
  };

  const onPointerMove = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== pending.pointerId) {
      return;
    }

    const distance = Math.hypot(moveEvent.clientX - pending.startX, moveEvent.clientY - pending.startY);
    if (!plugin.dragState) {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      if (distance < POINTER_DRAG_THRESHOLD) {
        return;
      }
      startPointerDrag(plugin, pending);
    }

    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    if (plugin.dragState) {
      positionDragHighlight(plugin.dragState);
      positionDropIndicator(plugin.dragState, moveEvent);
    }
  };

  const onPointerUp = (upEvent: PointerEvent) => {
    if (upEvent.pointerId !== pending.pointerId) {
      return;
    }

    if (plugin.dragState) {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      performDrop(plugin, pending.view, upEvent);
      clearPointerSelection(pending.view);
      if (pending.kind === "checkbox") {
        suppressNextCheckboxClick(plugin);
      } else {
        suppressNextNumberClick(plugin);
      }
    }
    onDone();
  };

  const onPointerCancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== pending.pointerId) {
      return;
    }
    clearDragState(plugin);
    clearPointerSelection(pending.view);
    onDone();
  };

  const onSelectStart = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ownerWindow.addEventListener("pointermove", onPointerMove, true);
  ownerWindow.addEventListener("selectstart", onSelectStart, true);
  ownerWindow.addEventListener("pointerup", onPointerUp, true);
  ownerWindow.addEventListener("pointercancel", onPointerCancel, true);
  pending.removeListeners = () => {
    ownerWindow.removeEventListener("pointermove", onPointerMove, true);
    ownerWindow.removeEventListener("selectstart", onSelectStart, true);
    ownerWindow.removeEventListener("pointerup", onPointerUp, true);
    ownerWindow.removeEventListener("pointercancel", onPointerCancel, true);
  };

  return pending;
}

function startPointerDrag(plugin: ChecklistFlowPlugin, pending: PendingDrag) {
  clearDragState(plugin);
  pending.view.dom.classList.add("checklist-flow-dragging");
  resetSelectionToLine(pending.view, pending.lineIndex);
  const highlight = createDragHighlight(pending.view);
  const updateHighlight = () => {
    if (plugin.dragState?.view === pending.view) {
      positionDragHighlight(plugin.dragState);
    }
  };
  pending.view.scrollDOM.addEventListener("scroll", updateHighlight);
  plugin.dragState = {
    highlight,
    indicator: createDropIndicator(pending.view),
    lineIndex: pending.lineIndex,
    kind: pending.kind,
    removeHighlightScrollListener: () => pending.view.scrollDOM.removeEventListener("scroll", updateHighlight),
    view: pending.view,
  };
  if (plugin.dragState) {
    positionDragHighlight(plugin.dragState);
  }
}

function performDrop(plugin: ChecklistFlowPlugin, view: EditorView, event: { clientY: number }) {
  const dragState = plugin.dragState;
  if (!dragState || dragState.view !== view) {
    clearDragState(plugin);
    return;
  }

  const drop = getDropTarget(view, event, dragState.lineIndex);
  if (!drop) {
    clearDragState(plugin);
    return;
  }

  const text = view.state.doc.toString();
  const findTargetLine = dragState.kind === "number" ? findListStartLineAtOrAbove : findTaskStartLineAtOrAbove;
  const targetListLine = findTargetLine(text, drop.lineIndex);
  if (targetListLine === null) {
    clearDragState(plugin);
    return;
  }

  const move = dragState.kind === "number" ? moveListBlock : moveTaskBlock;
  const result = move(
    text,
    dragState.lineIndex,
    targetListLine,
    drop.placeAfterTarget,
    plugin.settings,
  );
  clearDragState(plugin);

  if (result.changed) {
    dispatchPreservingScroll(view, minimalChange(view.state.doc.toString(), result.text));
  }
}

function suppressNextCheckboxClick(plugin: ChecklistFlowPlugin) {
  plugin.suppressNextCheckboxClick = true;
  window.setTimeout(() => {
    plugin.suppressNextCheckboxClick = false;
  }, SUPPRESS_CLICK_MS);
}

function suppressNextNumberClick(plugin: ChecklistFlowPlugin) {
  plugin.suppressNextNumberClick = true;
  window.setTimeout(() => {
    plugin.suppressNextNumberClick = false;
  }, SUPPRESS_CLICK_MS);
}

function dispatchPreservingScroll(view: EditorView, changes: { from: number; insert: string; to: number }) {
  const { scrollDOM } = view;
  const scrollLeft = scrollDOM.scrollLeft;
  const scrollTop = scrollDOM.scrollTop;

  view.dispatch({
    changes,
    scrollIntoView: false,
  });

  restoreScroll(scrollDOM, scrollLeft, scrollTop);
  window.requestAnimationFrame(() => restoreScroll(scrollDOM, scrollLeft, scrollTop));
}

function restoreScroll(scrollDOM: HTMLElement, scrollLeft: number, scrollTop: number) {
  scrollDOM.scrollLeft = scrollLeft;
  scrollDOM.scrollTop = scrollTop;
}

function minimalChange(before: string, after: string): { from: number; insert: string; to: number } {
  if (before === after) {
    return { from: 0, insert: "", to: 0 };
  }

  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) {
    from += 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > from && afterEnd > from && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    from,
    insert: after.slice(from, afterEnd),
    to: beforeEnd,
  };
}

interface DropTarget {
  indicatorLeft: number;
  indicatorTop: number;
  indicatorWidth: number;
  lineIndex: number;
  placeAfterTarget: boolean;
}

interface ListItemLineMetric {
  bottom: number;
  left: number;
  lineIndex: number;
  top: number;
}

function getDropTarget(view: EditorView, event: { clientY: number }, sourceLineIndex: number): DropTarget | null {
  const metrics = getListItemLineMetrics(view, sourceLineIndex);
  if (metrics.length === 0) {
    return null;
  }

  const slots = [
    {
      lineIndex: metrics[0].lineIndex,
      left: metrics[0].left,
      placeAfterTarget: false,
      y: metrics[0].top,
    },
    ...metrics.map((metric) => ({
      lineIndex: metric.lineIndex,
      left: metric.left,
      placeAfterTarget: true,
      y: metric.bottom,
    })),
  ];

  const nearestSlot = slots.reduce((best, slot) =>
    Math.abs(event.clientY - slot.y) < Math.abs(event.clientY - best.y) ? slot : best,
  );
  const scrollRect = view.scrollDOM.getBoundingClientRect();

  return {
    indicatorLeft: Math.max(0, nearestSlot.left - scrollRect.left + view.scrollDOM.scrollLeft),
    indicatorTop: nearestSlot.y - scrollRect.top + view.scrollDOM.scrollTop,
    indicatorWidth: Math.max(48, scrollRect.right - nearestSlot.left - 12),
    lineIndex: nearestSlot.lineIndex,
    placeAfterTarget: nearestSlot.placeAfterTarget,
  };
}

function getListItemLineMetrics(view: EditorView, sourceLineIndex: number): ListItemLineMetric[] {
  const text = view.state.doc.toString();
  const siblingLineIndexes = getSiblingListLineIndexes(text, sourceLineIndex);
  if (siblingLineIndexes.length === 0) {
    return [];
  }

  return siblingLineIndexes.flatMap((lineIndex) => {
    const line = view.state.doc.line(lineIndex + 1);
    const coords = view.coordsAtPos(line.from);
    const lineElement = view.domAtPos(line.from).node.parentElement?.closest(".cm-line");
    const rect = lineElement?.getBoundingClientRect();
    if (!coords && !rect) {
      return [];
    }

    return [
      {
        bottom: rect?.bottom ?? coords!.bottom,
        left: coords?.left ?? rect!.left,
        lineIndex,
        top: rect?.top ?? coords!.top,
      },
    ];
  });
}

function positionDropIndicator(dragState: DragState, event: { clientY: number }) {
  const drop = getDropTarget(dragState.view, event, dragState.lineIndex);
  if (!drop) {
    dragState.indicator.setCssProps({ opacity: "0" });
    return;
  }

  dragState.indicator.setCssProps({
    left: `${drop.indicatorLeft}px`,
    opacity: "1",
    top: `${drop.indicatorTop}px`,
    width: `${drop.indicatorWidth}px`,
  });
}

function createDropIndicator(view: EditorView): HTMLElement {
  view.scrollDOM.querySelectorAll(".checklist-flow-drop-indicator").forEach((indicator) => indicator.remove());
  return view.scrollDOM.createDiv({ cls: "checklist-flow-drop-indicator" });
}

function createDragHighlight(view: EditorView): HTMLElement {
  view.scrollDOM.querySelectorAll(".checklist-flow-drag-highlight").forEach((highlight) => highlight.remove());
  return view.scrollDOM.createDiv({ cls: "checklist-flow-drag-highlight" });
}

function positionDragHighlight(dragState: DragState) {
  const lineElement = getLineElement(dragState.view, dragState.lineIndex);
  const rect = lineElement?.getBoundingClientRect();
  if (!rect) {
    dragState.highlight.setCssProps({ opacity: "0" });
    return;
  }

  const scrollRect = dragState.view.scrollDOM.getBoundingClientRect();
  dragState.highlight.setCssProps({
    height: `${rect.height}px`,
    left: `${rect.left - scrollRect.left + dragState.view.scrollDOM.scrollLeft}px`,
    opacity: "1",
    top: `${rect.top - scrollRect.top + dragState.view.scrollDOM.scrollTop}px`,
    width: `${rect.width}px`,
  });
}

function clearDragState(plugin: ChecklistFlowPlugin) {
  plugin.dragState?.view.dom.classList.remove("checklist-flow-dragging");
  plugin.dragState?.removeHighlightScrollListener();
  plugin.dragState?.highlight.remove();
  plugin.dragState?.indicator.remove();
  plugin.dragState = null;
}

function clearPointerSelection(view: EditorView) {
  const selection = view.state.selection.main;
  view.dispatch({
    scrollIntoView: false,
    selection: { anchor: selection.head, head: selection.head },
  });
  view.dom.ownerDocument.getSelection()?.removeAllRanges();
}

function resetSelectionToLine(view: EditorView, lineIndex: number) {
  const line = view.state.doc.line(lineIndex + 1);
  view.dispatch({
    scrollIntoView: false,
    selection: { anchor: line.from, head: line.from },
  });
}

function getLineElement(view: EditorView, lineIndex: number): HTMLElement | null {
  const line = view.state.doc.line(lineIndex + 1);
  const at = view.domAtPos(line.from);
  const node = at.node instanceof Element ? at.node : at.node.parentElement;
  return node?.closest(".cm-line") ?? null;
}

function getTaskCheckbox(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const checkbox = target.closest('input[type="checkbox"], .task-list-item-checkbox');
  if (!(checkbox instanceof HTMLElement)) {
    return null;
  }
  if (!checkbox.closest(".cm-line")) {
    return null;
  }
  return checkbox;
}

function getTaskLineIndexFromElement(view: EditorView, element: HTMLElement): number | null {
  const lineElement = element.closest(".cm-line");
  if (!lineElement) {
    return null;
  }

  try {
    return view.state.doc.lineAt(view.posAtDOM(lineElement)).number - 1;
  } catch {
    const rect = lineElement.getBoundingClientRect();
    const position = view.posAtCoords({ x: rect.left + 1, y: rect.top + rect.height / 2 });
    return position === null ? null : view.state.doc.lineAt(position).number - 1;
  }
}

function getOrderedNumberLineIndexAtPoint(view: EditorView, event: PointerEvent): number | null {
  if (!(event.target instanceof HTMLElement) || !event.target.closest(".cm-line")) {
    return null;
  }

  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null) {
    return null;
  }

  const line = view.state.doc.lineAt(position);
  const markerLength = getOrderedListMarkerLength(line.text);
  if (markerLength === null || position > line.from + markerLength) {
    return null;
  }

  return line.number - 1;
}
