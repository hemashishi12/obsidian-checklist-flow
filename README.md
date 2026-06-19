# Checklist Flow

Checklist Flow is an Obsidian plugin for making Markdown task lists feel closer to Apple Notes:

- Checked tasks automatically sink below unfinished sibling tasks.
- Ordered task lists keep their starting number after automatic sinking or manual reordering.
- Same-level task items can be reordered by holding and dragging the task checkbox.

## Usage

Install or enable the `Checklist Flow` plugin in Obsidian, then use normal Markdown task lists:

```markdown
5. [ ] Listen to a course
6. [ ] Review wrong questions
7. [x] Rest
```

When a task is checked, completed items move to the bottom of the same contiguous, same-level checklist. Child lines stay attached to their parent task.

To reorder manually, hold the checkbox and drag. An insertion line shows where the task will be placed. A plain click on the checkbox still toggles the task as usual.

## Settings

Open `Settings > Community plugins > Checklist Flow`.

- `Auto-sink completed tasks`: move completed tasks below unfinished siblings.
- `Drag from checkbox`: hold and drag a task checkbox to reorder same-level items.
- `Done status characters`: checkbox states treated as done. Default: `xX`.

## Scope

The plugin intentionally keeps v1 narrow:

- Works on regular Markdown task lines such as `- [ ]`, `- [x]`, `5. [ ]`, and `5. [x]`.
- Reorders only within the same contiguous checklist and indentation level.
- Keeps child task blocks and indented notes attached to their parent task.
- Does not reorder Tasks query results, reading view output, tables, Kanban cards, callouts, or code blocks.

## Development

Install dependencies:

```powershell
npm install --no-audit --no-fund
```

Run tests:

```powershell
npm test
```

Type-check:

```powershell
npx tsc --noEmit
```

Build for Obsidian:

```powershell
npm run build
```

The build writes `main.js`, `manifest.json`, and `styles.css` in the repository root. Copy those three files into an Obsidian plugin folder named `checklist-flow`, or install the plugin through your preferred Obsidian plugin development workflow.

## License

MIT
