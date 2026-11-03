import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { extendBlockSelection, paragraphRange } from "../src/margin-selection";

const doc = (text: string) => EditorState.create({ doc: text }).doc;

describe("margin selection", () => {
  it("selects a whole list line, including its marker, without its children", () => {
    const text = doc("- [ ] parent\n  - child\n2. next");
    expect(paragraphRange(text, 3)).toEqual({ from: 0, to: 12 });
    expect(paragraphRange(text, text.line(2).from)).toEqual({ from: 13, to: 22 });
    expect(paragraphRange(text, text.length)).toEqual({ from: 23, to: text.length });
  });

  it("expands ordinary paragraphs but stops at block and blank-line boundaries", () => {
    const text = doc("# heading\nfirst\nsecond\n\n- item\n> quote\n| row |\nafter");
    expect(paragraphRange(text, text.line(3).from)).toEqual({ from: 10, to: 22 });
    for (const n of [1, 4, 5, 6, 7, 8]) {
      const line = text.line(n);
      expect(paragraphRange(text, line.from)).toEqual({ from: line.from, to: line.to });
    }
  });

  it("extends down, shrinks on return, and reverses across the original item", () => {
    const text = doc("- first\n- second\n- third\n- last");
    const ranges = [1, 2, 3, 4].map(n => paragraphRange(text, text.line(n).from));
    expect(extendBlockSelection(ranges[1], ranges[3])).toEqual({ anchor: 8, head: text.length });
    expect(extendBlockSelection(ranges[1], ranges[2])).toEqual({ anchor: 8, head: 24 });
    expect(extendBlockSelection(ranges[1], ranges[1])).toEqual({ anchor: 8, head: 16 });
    expect(extendBlockSelection(ranges[1], ranges[0])).toEqual({ anchor: 16, head: 0 });
  });

  it("handles CRLF, Chinese text and an empty document using CodeMirror offsets", () => {
    const text = doc("- 中文\r\n- 测试");
    expect(extendBlockSelection(paragraphRange(text, 0), paragraphRange(text, text.length)))
      .toEqual({ anchor: 0, head: text.length });
    expect(paragraphRange(doc(""), 0)).toEqual({ from: 0, to: 0 });
  });
});
