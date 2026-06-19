import type { ChecklistFlowSettings } from "./settings";

export interface ChecklistChange {
  changed: boolean;
  text: string;
}

export type ChecklistTextEdit =
  | {
      changed: false;
    }
  | {
      changed: true;
      from: number;
      insert: string;
      to: number;
    };

interface NormalizedDocument {
  finalNewline: boolean;
  lineEnding: "\n" | "\r\n";
  lines: string[];
}

interface TaskLine {
  indent: number;
  marker: string;
  orderedDelimiter: "." | ")" | null;
  orderedNumber: number | null;
  prefix: string;
  status: string;
}

interface TaskBlock {
  start: number;
  end: number;
  task: TaskLine;
}

interface SiblingGroup {
  blocks: TaskBlock[];
  end: number;
  start: number;
}

const TASK_LINE_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([^\]])\](?:\s|$)/;
const FENCE_RE = /^\s*(```|~~~)/;

export function isTaskLine(line: string): boolean {
  return parseTaskLine(line) !== null;
}

export function sortChecklistAtLine(
  text: string,
  lineIndex: number,
  settings: Pick<ChecklistFlowSettings, "doneStatusChars">,
): ChecklistChange {
  const edit = sortChecklistEditAtLine(text, lineIndex, settings);
  if (!edit.changed) {
    return { changed: false, text };
  }
  return { changed: true, text: applyChecklistEdit(text, edit) };
}

export function sortChecklistEditAtLine(
  text: string,
  lineIndex: number,
  settings: Pick<ChecklistFlowSettings, "doneStatusChars">,
): ChecklistTextEdit {
  const document = splitDocument(text);
  const group = findSiblingGroup(document.lines, lineIndex, computeFenceLines(document.lines));
  if (!group || group.blocks.length < 2) {
    return { changed: false };
  }

  const sorted = stablePartitionBlocks(group.blocks, settings.doneStatusChars);
  if (sameBlockOrder(group.blocks, sorted)) {
    return { changed: false };
  }

  const replacement = renumberOrderedTaskBlocks(sorted, document.lines, group.blocks[0].task);
  return {
    changed: true,
    from: lineStartOffset(document, group.start),
    insert: joinReplacementLines(document, replacement, group.end),
    to: lineStartOffset(document, group.end),
  };
}

export function applyChecklistEdit(text: string, edit: ChecklistTextEdit): string {
  if (!edit.changed) {
    return text;
  }
  return `${text.slice(0, edit.from)}${edit.insert}${text.slice(edit.to)}`;
}

export function moveTaskBlock(
  text: string,
  sourceLineIndex: number,
  targetLineIndex: number,
  placeAfterTarget: boolean,
  settings: Pick<ChecklistFlowSettings, "doneStatusChars">,
): ChecklistChange {
  const document = splitDocument(text);
  const fenceLines = computeFenceLines(document.lines);
  const sourceGroup = findSiblingGroup(document.lines, sourceLineIndex, fenceLines);
  if (!sourceGroup || sourceGroup.blocks.length < 2) {
    return { changed: false, text };
  }

  const sourceIndex = sourceGroup.blocks.findIndex((block) => block.start === sourceLineIndex);
  const targetIndex = sourceGroup.blocks.findIndex((block) => block.start === targetLineIndex);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return { changed: false, text };
  }

  const nextBlocks = sourceGroup.blocks.slice();
  const [sourceBlock] = nextBlocks.splice(sourceIndex, 1);
  let insertionIndex = targetIndex + (placeAfterTarget ? 1 : 0);
  if (sourceIndex < insertionIndex) {
    insertionIndex -= 1;
  }
  if (insertionIndex === sourceIndex) {
    return { changed: false, text };
  }

  nextBlocks.splice(insertionIndex, 0, sourceBlock);

  const nextLines = document.lines.slice();
  const replacement = renumberOrderedTaskBlocks(nextBlocks, document.lines, sourceGroup.blocks[0].task);
  nextLines.splice(sourceGroup.start, sourceGroup.end - sourceGroup.start, ...replacement);

  const sortedAfterDrag = sortChecklistAtLine(
    joinDocument({ ...document, lines: nextLines }),
    targetLineIndex,
    settings,
  );
  if (sortedAfterDrag.changed) {
    return { changed: true, text: sortedAfterDrag.text };
  }

  return { changed: true, text: joinDocument({ ...document, lines: nextLines }) };
}

export function getTaskLineIndexAtTextPosition(text: string, position: number): number {
  const safePosition = Math.max(0, Math.min(position, text.length));
  return text.slice(0, safePosition).split(/\r?\n/).length - 1;
}

export function findTaskStartLineAtOrAbove(text: string, lineIndex: number): number | null {
  const document = splitDocument(text);
  const fenceLines = computeFenceLines(document.lines);
  const line = document.lines[lineIndex];
  if (!line || fenceLines[lineIndex]) {
    return null;
  }

  const task = parseTaskLine(line);
  if (task) {
    return lineIndex;
  }

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const candidate = document.lines[index];
    if (!candidate || isBlank(candidate) || fenceLines[index]) {
      return null;
    }
    const candidateTask = parseTaskLine(candidate);
    if (candidateTask && lineIndex < findBlockEnd(document.lines, index, candidateTask.indent, fenceLines)) {
      return index;
    }
  }
  return null;
}

export function getSiblingTaskLineIndexes(text: string, lineIndex: number): number[] {
  const document = splitDocument(text);
  const group = findSiblingGroup(document.lines, lineIndex, computeFenceLines(document.lines));
  return group?.blocks.map((block) => block.start) ?? [];
}

export function taskStatusChanged(beforeLine: string, afterLine: string): boolean {
  const before = parseTaskLine(beforeLine);
  const after = parseTaskLine(afterLine);
  return before !== null && after !== null && before.status !== after.status;
}

function splitDocument(text: string): NormalizedDocument {
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const normalized = text.replace(/\r\n/g, "\n");
  const finalNewline = normalized.endsWith("\n");
  const body = finalNewline ? normalized.slice(0, -1) : normalized;
  return {
    finalNewline,
    lineEnding,
    lines: body.length > 0 ? body.split("\n") : [],
  };
}

function joinDocument(document: NormalizedDocument): string {
  const joined = document.lines.join(document.lineEnding);
  return document.finalNewline ? `${joined}${document.lineEnding}` : joined;
}

function joinReplacementLines(document: NormalizedDocument, lines: string[], endLineIndex: number): string {
  const joined = lines.join(document.lineEnding);
  const needsTrailingLineEnding = endLineIndex < document.lines.length || document.finalNewline;
  return needsTrailingLineEnding ? `${joined}${document.lineEnding}` : joined;
}

function lineStartOffset(document: NormalizedDocument, lineIndex: number): number {
  let offset = 0;
  const cappedLineIndex = Math.min(lineIndex, document.lines.length);
  for (let index = 0; index < cappedLineIndex; index += 1) {
    offset += document.lines[index].length;
    if (index < document.lines.length - 1 || document.finalNewline) {
      offset += document.lineEnding.length;
    }
  }
  return offset;
}

function parseTaskLine(line: string): TaskLine | null {
  const match = line.match(TASK_LINE_RE);
  if (!match) {
    return null;
  }
  const orderedMarker = match[0].match(/^(\s*)(\d+)([.)])(\s+\[[^\]]\](?:\s|$))/);
  return {
    indent: indentationWidth(match[1]),
    marker: match[0],
    orderedDelimiter: orderedMarker ? (orderedMarker[3] as "." | ")") : null,
    orderedNumber: orderedMarker ? Number.parseInt(orderedMarker[2], 10) : null,
    prefix: match[1],
    status: match[2],
  };
}

function renumberOrderedTaskBlocks(blocks: TaskBlock[], lines: string[], numberingAnchor: TaskLine): string[] {
  if (!usesOrderedTaskMarkers(blocks, numberingAnchor)) {
    return blocks.flatMap((block) => lines.slice(block.start, block.end));
  }

  const firstNumber = numberingAnchor.orderedNumber ?? 1;
  const delimiter = numberingAnchor.orderedDelimiter ?? ".";
  return blocks.flatMap((block, index) => {
    const blockLines = lines.slice(block.start, block.end);
    const taskLine = blockLines[0];
    const nextNumber = firstNumber + index;
    return [
      taskLine.replace(/^(\s*)\d+([.)])(\s+\[[^\]]\](?:\s|$))/, `$1${nextNumber}${delimiter}$3`),
      ...blockLines.slice(1),
    ];
  });
}

function usesOrderedTaskMarkers(blocks: TaskBlock[], numberingAnchor: TaskLine): boolean {
  return (
    blocks.length > 0 &&
    numberingAnchor.orderedNumber !== null &&
    numberingAnchor.orderedDelimiter !== null &&
    blocks.every(
      (block) =>
        block.task.orderedNumber !== null &&
        block.task.orderedDelimiter !== null &&
        block.task.orderedDelimiter === numberingAnchor.orderedDelimiter,
    )
  );
}

function stablePartitionBlocks(blocks: TaskBlock[], doneStatusChars: string[]): TaskBlock[] {
  const doneChars = new Set(doneStatusChars);
  return [
    ...blocks.filter((block) => !doneChars.has(block.task.status)),
    ...blocks.filter((block) => doneChars.has(block.task.status)),
  ];
}

function sameBlockOrder(a: TaskBlock[], b: TaskBlock[]): boolean {
  return a.length === b.length && a.every((block, index) => block.start === b[index]?.start);
}

function findSiblingGroup(lines: string[], taskLineIndex: number, fenceLines: boolean[]): SiblingGroup | null {
  const task = parseTaskLine(lines[taskLineIndex] ?? "");
  if (!task || fenceLines[taskLineIndex]) {
    return null;
  }

  const regionStart = findRegionStart(lines, taskLineIndex, task.indent, fenceLines);
  const regionEnd = findRegionEnd(lines, taskLineIndex, task.indent, fenceLines);
  let index = regionStart;
  let currentBlocks: TaskBlock[] = [];

  while (index < regionEnd) {
    const candidate = parseTaskLine(lines[index]);
    if (!fenceLines[index] && candidate && candidate.indent === task.indent) {
      const end = findBlockEnd(lines, index, candidate.indent, fenceLines);
      currentBlocks.push({ start: index, end, task: candidate });
      index = end;
      continue;
    }

    if (currentBlocks.some((block) => block.start === taskLineIndex)) {
      return {
        blocks: currentBlocks,
        end: currentBlocks[currentBlocks.length - 1].end,
        start: currentBlocks[0].start,
      };
    }

    currentBlocks = [];
    index += 1;
  }

  if (!currentBlocks.some((block) => block.start === taskLineIndex)) {
    return null;
  }
  return {
    blocks: currentBlocks,
    end: currentBlocks[currentBlocks.length - 1].end,
    start: currentBlocks[0].start,
  };
}

function findRegionStart(lines: string[], taskLineIndex: number, indent: number, fenceLines: boolean[]): number {
  let index = taskLineIndex;
  while (index > 0) {
    const previous = lines[index - 1];
    if (isBlank(previous) || fenceLines[index - 1] || indentationWidth(previous) < indent) {
      break;
    }
    index -= 1;
  }
  return index;
}

function findRegionEnd(lines: string[], taskLineIndex: number, indent: number, fenceLines: boolean[]): number {
  let index = taskLineIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line) || fenceLines[index] || indentationWidth(line) < indent) {
      break;
    }
    index += 1;
  }
  return index;
}

function findBlockEnd(lines: string[], start: number, indent: number, fenceLines: boolean[]): number {
  let index = start + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line) || (!fenceLines[index] && indentationWidth(line) <= indent)) {
      break;
    }
    index += 1;
  }
  return index;
}

function computeFenceLines(lines: string[]): boolean[] {
  const result: boolean[] = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const startsOrEndsFence = FENCE_RE.test(lines[index]);
    result[index] = inFence;
    if (startsOrEndsFence) {
      inFence = !inFence;
      result[index] = true;
    }
  }
  return result;
}

function indentationWidth(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === " ") {
      width += 1;
      continue;
    }
    if (char === "\t") {
      width += 4;
      continue;
    }
    break;
  }
  return width;
}

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}
