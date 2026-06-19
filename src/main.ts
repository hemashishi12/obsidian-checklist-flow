import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { createChecklistFlowExtension } from "./editor-extension";
import { sortChecklistAtLine } from "./checklist";
import {
  DEFAULT_SETTINGS,
  type ChecklistFlowSettings,
  normalizeDoneStatusChars,
  serializeDoneStatusChars,
} from "./settings";

interface DragState {
  indicator: HTMLElement;
  lineIndex: number;
  view: EditorView;
}

export default class ChecklistFlowPlugin extends Plugin {
  dragState: DragState | null = null;
  suppressNextCheckboxClick = false;
  settings: ChecklistFlowSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.registerEditorExtension(createChecklistFlowExtension(this));
    this.addSettingTab(new ChecklistFlowSettingTab(this.app, this));

    this.addCommand({
      id: "sort-current-checklist",
      name: "Sort current checklist",
      editorCallback: (editor) => {
        const cursor = editor.getCursor();
        const text = editor.getValue();
        const result = sortChecklistAtLine(text, cursor.line, this.settings);
        if (!result.changed) {
          new Notice("Checklist Flow: nothing to sort here.");
          return;
        }
        editor.setValue(result.text);
      },
    });

    this.addCommand({
      id: "toggle-auto-sink-completed",
      name: "Toggle auto-sink completed tasks",
      callback: async () => {
        this.settings.autoSinkCompleted = !this.settings.autoSinkCompleted;
        await this.saveSettings();
        this.refreshEditors();
        new Notice(`Checklist Flow: auto-sink ${this.settings.autoSinkCompleted ? "enabled" : "disabled"}.`);
      },
    });

    this.addCommand({
      id: "toggle-drag-handles",
      name: "Toggle checkbox drag reorder",
      callback: async () => {
        this.settings.enableDragHandles = !this.settings.enableDragHandles;
        await this.saveSettings();
        this.refreshEditors();
        new Notice(`Checklist Flow: checkbox drag reorder ${this.settings.enableDragHandles ? "enabled" : "disabled"}.`);
      },
    });
  }

  async loadSettings() {
    const data = await this.loadData();
    const enableDragHandles = data?.enableDragHandles ?? DEFAULT_SETTINGS.enableDragHandles;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      enableDragHandles,
      doneStatusChars: Array.isArray(data?.doneStatusChars)
        ? data.doneStatusChars
        : DEFAULT_SETTINGS.doneStatusChars,
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  refreshEditors() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const cm = (view.editor as unknown as { cm?: EditorView }).cm;
        cm?.dispatch({});
      }
    });
  }
}

class ChecklistFlowSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: ChecklistFlowPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Auto-sink completed tasks")
      .setDesc("When a checklist item is checked, move it below unchecked siblings in the same contiguous list.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSinkCompleted).onChange(async (value) => {
          this.plugin.settings.autoSinkCompleted = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Drag from checkbox")
      .setDesc("Hold and drag a task checkbox to reorder same-level items in the current checklist.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableDragHandles).onChange(async (value) => {
          this.plugin.settings.enableDragHandles = value;
          await this.plugin.saveSettings();
          this.plugin.refreshEditors();
        }),
      );

    new Setting(containerEl)
      .setName("Done status characters")
      .setDesc("Characters treated as completed. Default: xX.")
      .addText((text) =>
        text
          .setPlaceholder("xX")
          .setValue(serializeDoneStatusChars(this.plugin.settings.doneStatusChars))
          .onChange(async (value) => {
            this.plugin.settings.doneStatusChars = normalizeDoneStatusChars(value);
            await this.plugin.saveSettings();
          }),
      );
  }
}
