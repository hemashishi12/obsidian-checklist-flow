import { EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type ChecklistFlowPlugin from "./main";
import {
  findTaskStartLineAtOrAbove,
  getSiblingTaskLineIndexes,
  moveTaskBlock,
  sortChecklistEditAtLine,
  taskStatusChanged,
} from "./checklist";

const POINTER_DRAG_THRESHOLD = 6;
const SUPPRESS_CLICK_MS = 250;

interface DragState {
  indicator: HTMLElement;
  lineIndex: number;
  view: EditorView;
}

interface PendingCheckboxDrag {
  lineIndex: number;
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
      private pendingDrag: PendingCheckboxDrag | null = null;
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
          if (!checkbox) {
            return;
          }

          const lineIndex = getTaskLineIndexFromElement(this.view, checkbox);
          if (lineIndex === null) {
            return;
          }

          const taskLineIndex = findTaskStartLineAtOrAbove(this.view.state.doc.toString(), lineIndex);
          if (taskLineIndex === null) {
            return;
          }

          this.clearPendingDrag();
          this.pendingDrag = createPendingCheckboxDrag(plugin, this.view, taskLineIndex, event, () =>
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

function createPendingCheckboxDrag(
  plugin: ChecklistFlowPlugin,
  view: EditorView,
  lineIndex: number,
  event: PointerEvent,
  onDone: () => void,
): PendingCheckboxDrag {
  const ownerWindow = view.dom.ownerDocument.defaultView ?? window;
  const pending: PendingCheckboxDrag = {
    lineIndex,
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
      if (distance < POINTER_DRAG_THRESHOLD) {
        return;
      }
      startPointerDrag(plugin, pending);
    }

    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    if (plugin.dragState) {
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
      suppressNextCheckboxClick(plugin);
    }
    onDone();
  };

  const onPointerCancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== pending.pointerId) {
      return;
    }
    clearDragState(plugin);
    onDone();
  };

  ownerWindow.addEventListener("pointermove", onPointerMove, true);
  ownerWindow.addEventListener("pointerup", onPointerUp, true);
  ownerWindow.addEventListener("pointercancel", onPointerCancel, true);
  pending.removeListeners = () => {
    ownerWindow.removeEventListener("pointermove", onPointerMove, true);
    ownerWindow.removeEventListener("pointerup", onPointerUp, true);
    ownerWindow.removeEventListener("pointercancel", onPointerCancel, true);
  };

  return pending;
}

function startPointerDrag(plugin: ChecklistFlowPlugin, pending: PendingCheckboxDrag) {
  clearDragState(plugin);
  pending.view.dom.classList.add("checklist-flow-dragging");
  plugin.dragState = {
    indicator: createDropIndicator(pending.view),
    lineIndex: pending.lineIndex,
    view: pending.view,
  };
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
  const targetTaskLine = findTaskStartLineAtOrAbove(text, drop.lineIndex);
  if (targetTaskLine === null) {
    clearDragState(plugin);
    return;
  }

  const result = moveTaskBlock(
    text,
    dragState.lineIndex,
    targetTaskLine,
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

interface TaskLineMetric {
  bottom: number;
  left: number;
  lineIndex: number;
  top: number;
}

function getDropTarget(view: EditorView, event: { clientY: number }, sourceLineIndex: number): DropTarget | null {
  const metrics = getTaskLineMetrics(view, sourceLineIndex);
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

function getTaskLineMetrics(view: EditorView, sourceLineIndex: number): TaskLineMetric[] {
  const text = view.state.doc.toString();
  const siblingLineIndexes = getSiblingTaskLineIndexes(text, sourceLineIndex);
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
    dragState.indicator.style.opacity = "0";
    return;
  }

  dragState.indicator.style.left = `${drop.indicatorLeft}px`;
  dragState.indicator.style.opacity = "1";
  dragState.indicator.style.top = `${drop.indicatorTop}px`;
  dragState.indicator.style.width = `${drop.indicatorWidth}px`;
}

function createDropIndicator(view: EditorView): HTMLElement {
  view.scrollDOM.querySelectorAll(".checklist-flow-drop-indicator").forEach((indicator) => indicator.remove());
  const indicator = document.createElement("div");
  indicator.className = "checklist-flow-drop-indicator";
  view.scrollDOM.appendChild(indicator);
  return indicator;
}

function clearDragState(plugin: ChecklistFlowPlugin) {
  plugin.dragState?.view.dom.classList.remove("checklist-flow-dragging");
  plugin.dragState?.indicator.remove();
  plugin.dragState = null;
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
