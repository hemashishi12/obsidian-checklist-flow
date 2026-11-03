# Checklist Flow

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero.svg">
  <img src="docs/assets/hero.svg" alt="Checklist Flow overview showing completed tasks sinking and an ordered list item being dragged with stable numbering." width="100%">
</picture>

**A calmer way to organize tasks and ordered lists in Obsidian.**

[![Release](https://img.shields.io/github/v/release/hemashishi12/obsidian-checklist-flow?color=7C3AED&label=release&logo=github)](https://github.com/hemashishi12/obsidian-checklist-flow/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0%2B-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](#development)
[![Tests](https://img.shields.io/badge/tests-Vitest-729F1D?logo=vitest&logoColor=white)](#development)
[![License](https://img.shields.io/badge/license-MIT-22C55E)](LICENSE)

[Install](#quick-start) · [Usage](#usage) · [Settings](#settings) · [Privacy](#privacy) · [Contributing](#contributing)

Completed tasks move out of the way. Numbered lists stay numbered.

</div>

## Why Checklist Flow?

Obsidian lists are excellent for thinking, but long checklists can become noisy as work changes. Checklist Flow keeps the editor calm: completed tasks sink below unfinished work, and same-level items can be rearranged with a direct press-and-drag gesture.

Everything stays in ordinary Markdown. There is no special syntax, no database, and no metadata hidden in your notes.

## Highlights

| | Capability | What you get |
| --- | --- | --- |
| ✅ | **Auto-sink completed tasks** | Finished work moves below unfinished siblings in the same contiguous list. |
| 🖐️ | **Drag task checkboxes** | Reorder same-level tasks while child notes and sublists stay attached. |
| 🔢 | **Drag ordinary list numbers** | Reorder numbered lists by pressing the number, not just checkboxes. |
| 🔢 | **Stable numbering** | A list starting at `5.` remains anchored to `5.` after sorting or dragging. |
| ↗️ | **Select from the left margin** | Click to select a list item or paragraph; hold and drag to select more. |
| 🧱 | **Markdown-native** | Works with regular `- [ ]`, `- [x]`, `1.`, and nested Markdown blocks. |
| 🔒 | **Local and private** | No account, telemetry, network request, or note-content collection. |

## Quick start

### Requirements

- Obsidian `1.5.0` or later
- A desktop or mobile Obsidian vault

### Install from a release

1. Open the [latest release](https://github.com/hemashishi12/obsidian-checklist-flow/releases/latest).
2. Download `main.js`, `manifest.json`, and `styles.css`.
3. Create this folder in your vault:

   ```text
   <vault>/.obsidian/plugins/checklist-flow/
   ```

4. Copy the three downloaded files into that folder.
5. In Obsidian, open **Settings → Community plugins**, refresh the list, and enable **Checklist Flow**.

### Install with BRAT

If you already use [BRAT](https://github.com/TfTHacker/obsidian42-brat), add this repository:

```text
hemashishi12/obsidian-checklist-flow
```

## Usage

### Complete and auto-sink tasks

Use ordinary Markdown tasks:

```markdown
- [ ] Read the paper
- [x] Send the reply
- [ ] Write the summary
```

With **auto-sink** enabled, checking *Send the reply* becomes:

```markdown
- [ ] Read the paper
- [ ] Write the summary
- [x] Send the reply
```

Only sibling items in the same contiguous list are reordered. Nested notes and child lists remain attached to their parent.

### Drag to reorder

Press and hold a task checkbox:

```markdown
- [ ] First
- [ ] Second
- [ ] Third
```

Or press and hold an ordinary ordered-list number:

```markdown
1. First
2. Second
3. Third
```

While dragging:

- an insertion line shows the drop position;
- the dragged line remains highlighted;
- the cursor changes to a closed hand;
- text selection is suppressed until the gesture ends.

A quick click still toggles a checkbox. List numbers have no hover effect and remain visually unchanged until a press-and-drag gesture starts.

### Select from the left margin

Move the mouse into the blank area to the left of a line. The cursor becomes a right-pointing arrow. Click to select a whole list item or heading, or a whole ordinary paragraph. List items include their Markdown markers; nested items remain separate lines. Blank lines, quotes, table rows and headings stop paragraph expansion.

Keep the left mouse button pressed and drag up or down to extend the selection across additional items/paragraphs. Moving back shrinks the selection; crossing the starting item reverses its direction. The selection includes all text between its endpoints. Dragging near the editor's top or bottom scrolls automatically. Release to keep the selected text, ready to copy or edit. Escape, window blur or pointer cancellation ends the gesture.

This mouse feature works in Live Preview and Source Mode, including popout editor windows, independently of the drag-reorder setting. Checkbox and number dragging still reorder items; start in the blank left margin to select instead.

This integrates **Margin Paragraph Select**. Disable that standalone plugin when using Checklist Flow to avoid duplicate input handlers.

## Supported scope

| Works | Not covered |
| --- | --- |
| Regular Markdown task lines | Reading-view rendered checklists |
| Ordinary numbered-list lines | Tasks plugin query results |
| Same-level sibling items | Kanban cards, tables, and canvas cards |
| Nested blocks attached to a parent task/list | Content inside fenced code blocks |

Checklist Flow intentionally edits only the affected contiguous list block. That keeps behavior predictable in notes that mix outlines, quotes, code, and tasks.

## Settings

Open **Settings → Community plugins → Checklist Flow**.

| Setting | Default | Description |
| --- | --- | --- |
| **Auto-sink completed tasks** | On | Move completed tasks below unfinished siblings. |
| **Drag from checkbox or number** | On | Enable press-and-drag reordering. |
| **Done status characters** | `xX` | Checkbox values treated as completed. |

## Privacy

Checklist Flow runs locally inside Obsidian. It does **not**:

- collect note contents or usage analytics;
- make network requests;
- require an account or external service;
- add telemetry, tracking identifiers, or metadata to notes.

## Development

### Setup

```bash
npm install --no-audit --no-fund
```

### Commands

```bash
npm test
npx tsc --noEmit
npm run build
npm run dev
```

`npm run build` generates these files in the repository root:

```text
main.js
manifest.json
styles.css
```

Copy them into a folder named `checklist-flow` inside your vault’s `.obsidian/plugins/` directory to test a local build.

### Project layout

```text
src/
├── checklist.ts          # Pure Markdown parsing, sorting, and reordering
├── editor-extension.ts   # CodeMirror drag and auto-sink integration
├── main.ts               # Plugin lifecycle, commands, and settings
├── margin-selection.ts   # Left-margin click/drag selection and auto-scroll
└── settings.ts           # Shared setting types and defaults
tests/
├── checklist.test.ts     # Markdown transformation behavior tests
└── margin-selection.test.ts # Paragraph boundaries and directional selection
docs/
└── assets/
    └── hero.svg          # Generic documentation illustration
```

### Local integration notes

- Margin selection attaches DOM listeners to each editor's `ownerDocument`, including popouts. In this vault, CodeMirror DOM event extensions from a different module instance previously failed silently; direct DOM listeners and `editor.cm.dispatch({ selection: { anchor, head } })` work reliably.
- The mirrored cursor is calibrated to 16px with hotspot `15 1`; larger sizes looked oversized in Chromium.
- The local CLI is `C:\Tools\Obsidian\Obsidian.com`. After copying a build into the vault, run `plugin:reload id=checklist-flow` and `dev:errors`. CLI evaluation runs in the main document: use the editor's own document/window when testing pointer events.
- Bring Obsidian to the foreground before testing edge auto-scroll (`dev:cdp method=Page.bringToFront`): hidden windows pause animation frames and can produce a false failure. Local checks cover native mouse selection, checkbox clicks, number reordering, Source Mode and a separate popout document.

## Releasing

1. Update `version` in `manifest.json`, `package.json`, and `package-lock.json`.
2. Run tests, type checking, and a production build.
3. Push a tag whose name exactly matches the manifest version (for example, `0.2.0`, without a `v` prefix).
4. GitHub Actions builds and creates a draft release with `main.js`, `manifest.json`, and `styles.css`.
5. Review the draft, add release notes, and publish it. The workflow also creates build provenance attestations.

## Contributing

Issues and pull requests are welcome. For behavior changes, please include tests covering Markdown edge cases such as indentation, nested blocks, blank-line boundaries, ordered numbering, and CRLF line endings.

1. Fork the repository.
2. Create a focused branch.
3. Add tests for new behavior.
4. Run `npm test` and `npx tsc --noEmit`.
5. Open a pull request with a short before/after description.

## License

[MIT](LICENSE)
