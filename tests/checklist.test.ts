import { describe, expect, it } from "vitest";
import {
  applyChecklistEdit,
  findTaskStartLineAtOrAbove,
  getSiblingTaskLineIndexes,
  moveTaskBlock,
  sortChecklistEditAtLine,
  sortChecklistAtLine,
  taskStatusChanged,
} from "../src/checklist";

const settings = { doneStatusChars: ["x", "X"] };

describe("sortChecklistAtLine", () => {
  it("moves completed tasks below unchecked siblings", () => {
    const result = sortChecklistAtLine("- [ ] a\n- [x] b\n- [ ] c\n", 1, settings);
    expect(result.changed).toBe(true);
    expect(result.text).toBe("- [ ] a\n- [ ] c\n- [x] b\n");
  });

  it("keeps child blocks attached to their parent task", () => {
    const input = "- [x] parent\n  - [ ] child\n  note\n- [ ] next\n";
    const result = sortChecklistAtLine(input, 0, settings);
    expect(result.text).toBe("- [ ] next\n- [x] parent\n  - [ ] child\n  note\n");
  });

  it("sorts only same-indent siblings", () => {
    const input = "- [ ] parent\n  - [x] child done\n  - [ ] child todo\n- [ ] next\n";
    const result = sortChecklistAtLine(input, 1, settings);
    expect(result.text).toBe("- [ ] parent\n  - [ ] child todo\n  - [x] child done\n- [ ] next\n");
  });

  it("does not cross blank lines", () => {
    const input = "- [x] a\n- [ ] b\n\n- [ ] c\n";
    const result = sortChecklistAtLine(input, 0, settings);
    expect(result.text).toBe("- [ ] b\n- [x] a\n\n- [ ] c\n");
  });

  it("ignores task-looking lines inside fenced code blocks", () => {
    const input = "```\n- [x] code\n- [ ] code\n```\n- [x] a\n- [ ] b\n";
    const result = sortChecklistAtLine(input, 1, settings);
    expect(result.changed).toBe(false);
  });

  it("preserves CRLF line endings", () => {
    const input = "- [x] a\r\n- [ ] b\r\n";
    const result = sortChecklistAtLine(input, 0, settings);
    expect(result.text).toBe("- [ ] b\r\n- [x] a\r\n");
  });

  it("can return a local edit for only the affected checklist", () => {
    const input = "# before\n\n- [x] a\n- [ ] b\n\n# after\n";
    const edit = sortChecklistEditAtLine(input, 2, settings);
    expect(edit.changed).toBe(true);
    if (!edit.changed) {
      return;
    }
    expect(edit.from).toBe(input.indexOf("- [x] a"));
    expect(input.slice(edit.from, edit.to)).toBe("- [x] a\n- [ ] b\n");
    expect(applyChecklistEdit(input, edit)).toBe("# before\n\n- [ ] b\n- [x] a\n\n# after\n");
  });

  it("keeps ordered checklist numbering anchored after sinking the first item", () => {
    const input = "5. [x] a\n6. [ ] b\n7. [ ] c\n";
    const result = sortChecklistAtLine(input, 0, settings);
    expect(result.text).toBe("5. [ ] b\n6. [ ] c\n7. [x] a\n");
  });
});

describe("moveTaskBlock", () => {
  it("moves a task before a same-level target", () => {
    const input = "- [ ] a\n- [ ] b\n- [ ] c\n";
    const result = moveTaskBlock(input, 2, 0, false, settings);
    expect(result.text).toBe("- [ ] c\n- [ ] a\n- [ ] b\n");
  });

  it("moves child blocks with the dragged task", () => {
    const input = "- [ ] a\n- [ ] b\n  - [ ] child\n- [ ] c\n";
    const result = moveTaskBlock(input, 1, 3, true, settings);
    expect(result.text).toBe("- [ ] a\n- [ ] c\n- [ ] b\n  - [ ] child\n");
  });

  it("renumbers ordered checklist items after dragging", () => {
    const input = "5. [ ] a\n6. [ ] b\n7. [ ] c\n";
    const result = moveTaskBlock(input, 2, 0, false, settings);
    expect(result.text).toBe("5. [ ] c\n6. [ ] a\n7. [ ] b\n");
  });

  it("rejects cross-level moves", () => {
    const input = "- [ ] a\n  - [ ] child\n- [ ] b\n";
    const result = moveTaskBlock(input, 1, 2, false, settings);
    expect(result.changed).toBe(false);
  });
});

describe("helpers", () => {
  it("detects checkbox status changes", () => {
    expect(taskStatusChanged("- [ ] a", "- [x] a")).toBe(true);
    expect(taskStatusChanged("- [ ] a", "- [ ] changed")).toBe(false);
  });

  it("finds parent task start from a child line", () => {
    const input = "- [ ] a\n  details\n- [ ] b\n";
    expect(findTaskStartLineAtOrAbove(input, 1)).toBe(0);
  });

  it("returns same-level sibling task line indexes", () => {
    const input = "- [ ] a\n  - [ ] child\n- [ ] b\n\n- [ ] c\n";
    expect(getSiblingTaskLineIndexes(input, 0)).toEqual([0, 2]);
  });
});
