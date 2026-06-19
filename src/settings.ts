export interface ChecklistFlowSettings {
  autoSinkCompleted: boolean;
  enableDragHandles: boolean;
  doneStatusChars: string[];
}

export const DEFAULT_SETTINGS: ChecklistFlowSettings = {
  autoSinkCompleted: true,
  enableDragHandles: true,
  doneStatusChars: ["x", "X"],
};

export function normalizeDoneStatusChars(input: string): string[] {
  const chars = Array.from(input)
    .map((char) => char.trim())
    .filter((char) => char.length === 1 && char !== " ");
  return Array.from(new Set(chars.length > 0 ? chars : DEFAULT_SETTINGS.doneStatusChars));
}

export function serializeDoneStatusChars(chars: string[]): string {
  return chars.join("");
}
