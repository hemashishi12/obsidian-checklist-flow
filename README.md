# Checklist Flow

<div align="center">

**A calmer way to organize tasks and ordered lists in Obsidian.**

[![Release](https://img.shields.io/github/v/release/hemashishi12/obsidian-checklist-flow?color=7C3AED&label=release&logo=github)](https://github.com/hemashishi12/obsidian-checklist-flow/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.5.0%2B-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![License](https://img.shields.io/badge/license-MIT-22C55E)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-Vitest-729F1D?logo=vitest&logoColor=white)](#development)

Completed tasks move out of the way. Numbered lists stay numbered.

</div>

---

## Why Checklist Flow?

Obsidian task lists are great for writing, but long lists can become noisy as items are completed. Checklist Flow keeps the editor simple: finish a task and it sinks below unfinished work; hold a checkbox or a list number to rearrange the list directly.

The plugin works on plain Markdown. There is no special syntax, no database to maintain, and no metadata added to your notes.

## Highlights

| | Feature | What it does |
| --- | --- | --- |
| ✅ | **Auto-sink completed tasks** | Completed tasks move below unfinished siblings in the same checklist. |
| 🖐️ | **Drag task checkboxes** | Reorder same-level task items while keeping nested content attached. |
| 🔢 | **Drag ordinary list numbers** | Reorder numbered lists by pressing and dragging the number. |
| 🔢 | **Stable numbering** | A list starting at `5.` remains anchored to `5.` after sorting or dragging. |
| 🧱 | **Markdown-native** | Uses regular `- [ ]`, `- [x]`, `1.`, and nested Markdown blocks. |
| 🔒 | **Local and private** | No account, telemetry, network request, or note-content collection. |

## Quick start

### Requirements

- Obsidian `1.5.0` or later
- A desktop or mobile Obsidian vault

### Install from a release

1. Open the [latest release](https://github.com/hemashishi12/obsidian-checklist-flow/releases/latest).
2. Download `main.js`, `manifest.json`, and `styles.css`.
3. In your vault, create the folder:

   ```text
   <vault>/.obsidian/plugins/checklist-flow/
   ```

4. Copy the three downloaded files into that folder.
5. In Obsidian, go to **Settings → Community plugins**, refresh the list, and enable **Checklist Flow**.

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

When **auto-sink** is enabled, checking *Send the reply* becomes:

```markdown
- [ ] Read the paper
- [ ] Write the summary
- [x] Send the reply
```

Only sibling items in the same contiguous list are reordered. Nested notes and child lists remain attached to their parent.

### Drag to reorder

For a task list, press and hold the checkbox, then drag:

```markdown
- [ ] First
- [ ] Second
- [ ] Third
```

For an ordinary ordered list, press and hold the item number, then drag:

```markdown
1. First
2. Second
3. Third
```

An insertion line shows the drop position, the dragged line stays highlighted, and the cursor becomes a closed hand while dragging. After a drop, ordered markers are normalized while preserving the list’s original starting number.

A quick click on a checkbox still toggles the task. List numbers do not gain a hover cursor or visual effect; they remain visually unchanged until a press-and-drag gesture starts.

## Supported scope

| Works | Does not work |
| --- | --- |
| Regular Markdown task lines | Reading-view rendered checklists |
| Ordinary numbered-list lines | Tasks plugin query results |
| Same-level sibling items | Kanban cards, tables, and canvas cards |
| Nested task/list blocks attached to a parent | Content inside fenced code blocks |

Checklist Flow deliberately edits only the affected contiguous list block. This keeps predictable behavior in notes that mix outlines, quotes, code, and task lists.

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

### Common commands

```bash
npm test
npx tsc --noEmit
npm run build
npm run dev
```

`npm run build` generates three files in the repository root:

```text
main.js
manifest.json
styles.css
```

Copy those files into a folder named `checklist-flow` inside your vault’s `.obsidian/plugins/` directory to test a local build.

### Project layout

```text
src/
├── checklist.ts          # Pure Markdown list parsing, sorting, and reordering
├── editor-extension.ts   # CodeMirror drag and auto-sink integration
├── main.ts               # Plugin lifecycle, commands, and settings
└── settings.ts           # Shared settings types and defaults
tests/
└── checklist.test.ts     # Behavior tests for Markdown transformations
```

## Releasing

1. Update `version` in `manifest.json`, `package.json`, and `package-lock.json`.
2. Run tests, type checking, and a production build.
3. Publish `main.js`, `manifest.json`, and `styles.css` as GitHub Release assets.
4. Ensure the release tag matches the version in `manifest.json` (for example, `v0.2.0`).

## Contributing

Issues and pull requests are welcome. For behavioral changes, please include tests covering Markdown edge cases such as indentation, nested blocks, blank-line boundaries, and CRLF line endings.

## License

[MIT](LICENSE)
