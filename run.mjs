// =============================================================
// Kingdom Manager — Obsidian plugin entry point
// =============================================================
// Adds a markdown code block processor for ```kingdom``` blocks.
//
// Each block represents one settlement, identified by `id:` and grouped
// under a kingdom by `kingdom:`. Multiple settlement blocks sharing the
// same `kingdom:` value share that kingdom's level + commodity stockpiles.
//
// Example block:
//
//     ```kingdom
//     id: tuskwater-junction
//     name: Tuskwater Junction
//     kingdom: New Stetven
//     capital: true
//     ```

import { Plugin, MarkdownPostProcessorContext, Notice, normalizePath, Editor } from 'obsidian';
import { UrbanGridView } from './UrbanGridView';
import { KingdomSheetView } from './KingdomSheetView';
import { HexMapView } from './HexMapView';
import { KingdomTurnView } from './KingdomTurnView';
import { KingdomArmiesView } from './KingdomArmiesView';
import { KingdomEventsView } from './KingdomEventsView';
import { KingdomSetupModal, type KingdomSetupResult } from './KingdomSetupModal';
import { KingdomLevelUpModal } from './KingdomLevelUpModal';
import { KingdomManagerSettingsTab } from './KingdomManagerSettingsTab';
import { setImageOverride, clearImageOverrides } from './buildings';
import {
  DEFAULT_PLUGIN_DATA,
  makeEmptySettlement,
  makeEmptyKingdom,
  migrateKingdom,
  type PluginData,
  type SettlementState,
  type KingdomState,
} from './types';

interface SettlementBlockParams {
  /** Required. Stable id used to persist this settlement. */
  id: string;
  /** Optional display name override. */
  name?: string;
  /** Optional `capital: true` to flag as capital. */
  capital?: boolean;
  /** Optional kingdom name. Defaults to "Default Kingdom" if omitted. */
  kingdom?: string;
}

const DEFAULT_KINGDOM_NAME = 'Default Kingdom';

export default class KingdomManagerPlugin extends Plugin {
  private data: PluginData = { kingdoms: {}, settlements: {} };

  async onload() {
    console.log('[Kingdom Manager] loading');
    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    this.data = {
      kingdoms: loaded?.kingdoms ?? {},
      settlements: loaded?.settlements ?? {},
    };

    // Migration: any settlement without `kingdomName` gets default kingdom.
    for (const sid of Object.keys(this.data.settlements)) {
      const s = this.data.settlements[sid];
      if (!s.kingdomName) {
        s.kingdomName = DEFAULT_KINGDOM_NAME;
      }
      if (!this.data.kingdoms[s.kingdomName]) {
        this.data.kingdoms[s.kingdomName] = makeEmptyKingdom(s.kingdomName);
      }
    }
    // Migration: ensure all kingdom records have current shape.
    for (const kname of Object.keys(this.data.kingdoms)) {
      this.data.kingdoms[kname] = migrateKingdom(this.data.kingdoms[kname]);
    }
    await this.saveData(this.data);

    // Load runtime image overrides from the plugin folder.
    await this.loadImageOverrides();

    this.addSettingTab(new KingdomManagerSettingsTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor('kingdom-settlement', this.renderSettlementBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor('kingdom-sheet', this.renderKingdomSheetBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor('kingdom-hex', this.renderHexMapBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor('kingdom-turn', this.renderKingdomTurnBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor('kingdom-armies', this.renderKingdomArmiesBlock.bind(this));
    this.registerMarkdownCodeBlockProcessor('kingdom-events', this.renderKingdomEventsBlock.bind(this));

    // -------------------------------------------------------
    // Setup wizard — main onboarding command
    // -------------------------------------------------------
    this.addCommand({
      id: 'kingdom-manager-setup-new-kingdom',
      name: 'Set up new kingdom (insert blocks at cursor)',
      editorCallback: async (editor: Editor) => {
        const modal = new KingdomSetupModal(this.app);
        const result = await modal.open();
        if (!result) return; // user cancelled
        await this.applySetupResult(editor, result);
      },
    });

    // -------------------------------------------------------
    // Per-block insert commands — for users who already have a
    // kingdom and just want to add another codeblock to a note.
    // Each prompts via Notice if no kingdom exists yet.
    // -------------------------------------------------------
    this.addCommand({
      id: 'kingdom-manager-insert-sheet',
      name: 'Insert kingdom sheet codeblock',
      editorCallback: async (editor: Editor) => {
        await this.insertSingleBlock(editor, 'kingdom-sheet');
      },
    });
    this.addCommand({
      id: 'kingdom-manager-insert-turn',
      name: 'Insert kingdom turn codeblock',
      editorCallback: async (editor: Editor) => {
        await this.insertSingleBlock(editor, 'kingdom-turn');
      },
    });
    this.addCommand({
      id: 'kingdom-manager-insert-hex',
      name: 'Insert kingdom hex map codeblock',
      editorCallback: async (editor: Editor) => {
        await this.insertSingleBlock(editor, 'kingdom-hex');
      },
    });
    this.addCommand({
      id: 'kingdom-manager-insert-armies',
      name: 'Insert kingdom armies codeblock',
      editorCallback: async (editor: Editor) => {
        await this.insertSingleBlock(editor, 'kingdom-armies');
      },
    });
    this.addCommand({
      id: 'kingdom-manager-insert-events',
      name: 'Insert kingdom events codeblock',
      editorCallback: async (editor: Editor) => {
        await this.insertSingleBlock(editor, 'kingdom-events');
      },
    });
    this.addCommand({
      id: 'kingdom-manager-insert-settlement',
      name: 'Insert settlement codeblock',
      editorCallback: async (editor: Editor) => {
        await this.insertSettlementBlock(editor);
      },
    });

    this.addCommand({
      id: 'kingdom-manager-level-up',
      name: 'Level up kingdom (open wizard)',
      callback: async () => {
        await this.openLevelUpWizard();
      },
    });

    this.addCommand({
      id: 'kingdom-manager-reset-all',
      name: 'Reset ALL settlement & kingdom data (irreversible)',
      callback: async () => {
        this.data = { ...DEFAULT_PLUGIN_DATA };
        await this.saveData(this.data);
      },
    });

    this.addCommand({
      id: 'kingdom-manager-reload-images',
      name: 'Reload building images from plugin folder',
      callback: async () => {
        const count = await this.loadImageOverrides();
        new Notice(`Loaded ${count} building image override(s).`);
      },
    });
  }

  /**
   * Scan `<plugin folder>/building_images/` for PNG files and register each
   * as a runtime image override keyed by its filename (minus extension). Any
   * file named e.g. `temple.png` will override the bundled image for the
   * `temple` building.
   *
   * Returns the number of overrides loaded.
   */
  private async loadImageOverrides(): Promise<number> {
    clearImageOverrides();
    const adapter = this.app.vault.adapter;
    const dir = normalizePath(`${this.manifest.dir ?? ''}/building_images`);
    let count = 0;
    try {
      const exists = await adapter.exists(dir);
      if (!exists) return 0;
      const listing = await adapter.list(dir);
      for (const filePath of listing.files) {
        const m = filePath.match(/([^/\\]+)\.png$/i);
        if (!m) continue;
        const buildingId = m[1].toLowerCase();
        try {
          const bytes = await adapter.readBinary(filePath);
          const dataUrl = bytesToDataUrl(bytes, 'image/png');
          setImageOverride(buildingId, dataUrl);
          count++;
        } catch (err) {
          console.warn(`[Kingdom Manager] failed to read ${filePath}:`, err);
        }
      }
    } catch (err) {
      console.warn('[Kingdom Manager] image override scan failed:', err);
    }
    if (count > 0) console.log(`[Kingdom Manager] loaded ${count} building image override(s) from ${dir}`);
    return count;
  }

  /**
   * Public wrapper for the settings tab's "Reload images" button.
   */
  async loadImageOverridesPublic(): Promise<number> {
    return this.loadImageOverrides();
  }

  /**
   * Public wrapper for the settings tab's "Reset all data" button. Wipes
   * all kingdoms and settlements and persists.
   */
  async resetAllDataPublic(): Promise<void> {
    this.data = { ...DEFAULT_PLUGIN_DATA };
    await this.saveData(this.data);
  }

  onunload() {
    console.log('[Kingdom Manager] unloading');
  }

  // ===========================================================
  // Setup wizard application
  // ===========================================================
  /**
   * Apply the result of the setup modal: pre-create the kingdom record
   * with the user's chosen starting values, optionally pre-create the
   * capital settlement, then insert the chosen codeblocks at the cursor.
   */
  private async applySetupResult(editor: Editor, result: KingdomSetupResult): Promise<void> {
    const kingdomName = result.kingdomName.trim();
    if (!kingdomName) return;

    // Detect duplicate kingdom name and warn (don't overwrite)
    const isExisting = !!this.data.kingdoms[kingdomName];
    if (isExisting) {
      const proceed = confirm(
        `A kingdom named "${kingdomName}" already exists. Inserting these blocks will reference the existing record without overwriting it. Proceed?`,
      );
      if (!proceed) return;
    }

    // Pre-create or update the kingdom record with the chosen fields
    if (!isExisting) {
      const fresh = makeEmptyKingdom(kingdomName);
      fresh.level = result.level;
      fresh.government = result.government;
      fresh.alignment = result.alignment;
      fresh.charter = result.charter;
      fresh.heartland = result.heartland;
      fresh.language = result.language;
      this.data.kingdoms[kingdomName] = fresh;
    }

    // Capital settlement: only create if a name is provided AND the user opted in
    let capitalSettlementId: string | null = null;
    if (result.capitalName.trim() && result.includeBlocks.capital) {
      // Build a stable id from the capital name (slugified). If a settlement with
      // that id already exists, just reuse it (don't overwrite the user's grid).
      const capitalName = result.capitalName.trim();
      const id = slugifyForId(capitalName);
      capitalSettlementId = id;
      if (!this.data.settlements[id]) {
        const s = makeEmptySettlement(capitalName, kingdomName);
        s.isCapital = true;
        this.data.settlements[id] = s;
      } else {
        // Update kingdomName link only if the user is reusing an existing settlement id
        const existing = this.data.settlements[id];
        if (existing.kingdomName !== kingdomName) {
          new Notice(`Settlement "${capitalName}" already exists in kingdom "${existing.kingdomName}"; not re-linking. Edit by hand if needed.`);
          capitalSettlementId = null;
        } else {
          existing.isCapital = true;
        }
      }
    }

    await this.saveData(this.data);

    // Build the codeblock text to insert
    const blocks: string[] = [];
    const inc = result.includeBlocks;

    // Order: outside-in. Geography first (where the kingdom is), then the
    // capital (its seat of power), then the abstract bookkeeping (sheet),
    // then the per-turn workflow (turn), then the things that respond to
    // that workflow (armies / events).
    if (inc.hex) {
      blocks.push(`\`\`\`kingdom-hex\nkingdom: ${kingdomName}\n\`\`\``);
    }
    if (inc.capital && capitalSettlementId) {
      // The settlement codeblock takes id+name+kingdom fields.
      blocks.push(
        `\`\`\`kingdom-settlement\nid: ${capitalSettlementId}\nname: ${result.capitalName.trim()}\nkingdom: ${kingdomName}\n\`\`\``,
      );
    }
    if (inc.sheet) {
      blocks.push(`\`\`\`kingdom-sheet\nkingdom: ${kingdomName}\n\`\`\``);
    }
    if (inc.turn) {
      blocks.push(`\`\`\`kingdom-turn\nkingdom: ${kingdomName}\n\`\`\``);
    }
    if (inc.armies) {
      blocks.push(`\`\`\`kingdom-armies\nkingdom: ${kingdomName}\n\`\`\``);
    }
    if (inc.events) {
      blocks.push(`\`\`\`kingdom-events\nkingdom: ${kingdomName}\n\`\`\``);
    }

    if (blocks.length === 0) {
      new Notice('No codeblocks selected — kingdom record created but nothing inserted.');
      return;
    }

    // Insert at cursor with a leading blank line if the previous line has content
    const cursor = editor.getCursor();
    const prevLine = cursor.line > 0 ? editor.getLine(cursor.line - 1) : '';
    const currentLine = editor.getLine(cursor.line);
    const needsLeadingNewline = currentLine.length > 0 || (cursor.ch > 0);
    const text = (needsLeadingNewline ? '\n\n' : '') + blocks.join('\n\n') + '\n';
    editor.replaceRange(text, cursor);

    new Notice(
      `Kingdom "${kingdomName}" ${isExisting ? 'referenced' : 'created'}; inserted ${blocks.length} codeblock${blocks.length === 1 ? '' : 's'}.`,
    );
  }

  // ===========================================================
  // Per-block insert commands
  // ===========================================================
  /**
   * Insert a single kingdom-* codeblock at the cursor. Uses the most recently
   * referenced kingdom name (or "Default Kingdom" if none exist yet) as a
   * sensible default, so the user gets a working block immediately.
   */
  private async insertSingleBlock(editor: Editor, blockType: string): Promise<void> {
    const kingdomName = this.suggestKingdomName();
    const block = `\`\`\`${blockType}\nkingdom: ${kingdomName}\n\`\`\``;
    insertBlockAtCursor(editor, block);
    if (!this.data.kingdoms[kingdomName]) {
      this.data.kingdoms[kingdomName] = makeEmptyKingdom(kingdomName);
      await this.saveData(this.data);
      new Notice(`Created new kingdom "${kingdomName}" and inserted ${blockType} block.`);
    } else {
      new Notice(`Inserted ${blockType} block for "${kingdomName}".`);
    }
  }

  /**
   * Insert a settlement (kingdom) codeblock at the cursor. Slightly different
   * shape — needs id + name + kingdom fields.
   */
  private async insertSettlementBlock(editor: Editor): Promise<void> {
    const kingdomName = this.suggestKingdomName();
    const id = `settlement-${Math.random().toString(36).slice(2, 8)}`;
    const block = `\`\`\`kingdom-settlement\nid: ${id}\nname: New Settlement\nkingdom: ${kingdomName}\n\`\`\``;
    insertBlockAtCursor(editor, block);
    new Notice(`Inserted settlement block for "${kingdomName}". Edit the name in the block source above.`);
  }

  /**
   * Pick a sensible default kingdom name for per-block insert commands.
   * Returns the most recently-referenced kingdom (alphabetically first if
   * multiple), or "Default Kingdom" if no kingdoms exist yet.
   */
  private suggestKingdomName(): string {
    const names = Object.keys(this.data.kingdoms).sort();
    if (names.length === 0) return 'Default Kingdom';
    return names[0];
  }

  /**
   * Open the level-up wizard for a kingdom. If only one kingdom exists, use
   * it directly; if multiple, ask via Notice (palette commands don't have a
   * great picker affordance, but we surface the names). If none, prompt.
   */
  private async openLevelUpWizard(): Promise<void> {
    const names = Object.keys(this.data.kingdoms);
    if (names.length === 0) {
      new Notice('No kingdoms to level up. Run "Set up new kingdom" first.');
      return;
    }
    let target = names[0];
    if (names.length > 1) {
      // Prefer the first kingdom that's actually ready to level up
      const ready = names.find(n => this.data.kingdoms[n].xp >= 1000);
      if (ready) target = ready;
      else {
        new Notice(`Multiple kingdoms found; opening wizard for "${target}". To choose another, click the level-up banner on that kingdom's sheet directly.`);
      }
    }
    const kingdom = this.data.kingdoms[target];
    if (kingdom.xp < 1000) {
      new Notice(`${target} has only ${kingdom.xp} XP — needs 1000 to level up. Wizard opens anyway, but Apply will fail.`);
    }
    const modal = new KingdomLevelUpModal(this.app, {
      kingdom,
      onApplied: async () => {
        this.data.kingdoms[target] = kingdom;
        await this.saveData(this.data);
      },
    });
    modal.open();
  }

  private async renderSettlementBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const params = parseSettlementBlock(source);
    if (!params.id) {
      el.createEl('p', {
        text: '⚠ Kingdom Manager: missing required `id:` field. Example:',
        cls: 'km-error',
      });
      el.createEl('pre', {
        text: '```kingdom-settlement\nid: my-settlement\nname: Tuskwater Junction\nkingdom: New Stetven\n```',
      });
      return;
    }

    const kingdomName = params.kingdom?.trim() || DEFAULT_KINGDOM_NAME;

    // Load or create the kingdom record.
    if (!this.data.kingdoms[kingdomName]) {
      this.data.kingdoms[kingdomName] = makeEmptyKingdom(kingdomName);
      await this.saveData(this.data);
    }
    let kingdom: KingdomState = this.data.kingdoms[kingdomName];

    // Load or create the settlement.
    let state: SettlementState =
      this.data.settlements[params.id] ?? makeEmptySettlement(params.name ?? params.id, kingdomName);

    // Apply block-level overrides.
    let mutated = false;
    if (params.name && state.name !== params.name) {
      state.name = params.name;
      mutated = true;
    }
    if (state.kingdomName !== kingdomName) {
      state.kingdomName = kingdomName;
      mutated = true;
    }
    if (typeof params.capital === 'boolean' && state.isCapital !== params.capital) {
      state.isCapital = params.capital;
      mutated = true;
    }
    if (!this.data.settlements[params.id] || mutated) {
      this.data.settlements[params.id] = state;
      await this.saveData(this.data);
    }

    const view = new UrbanGridView(this.app, el, {
      state,
      kingdom,
      onSettlementChange: async next => {
        this.data.settlements[params.id] = next;
        await this.saveData(this.data);
      },
      onKingdomChange: async next => {
        this.data.kingdoms[next.name] = next;
        await this.saveData(this.data);
      },
    });
    view.render();
  }

  /**
   * Render a ```kingdom-sheet ``` block. Required field: `kingdom: <name>`.
   * If the named kingdom doesn't exist yet, it's created with defaults.
   */
  private async renderKingdomSheetBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const params = parseKingdomBlock(source);
    if (!params.kingdom) {
      el.createEl('p', {
        text: '⚠ Kingdom Manager: missing required `kingdom:` field. Example:',
        cls: 'km-error',
      });
      el.createEl('pre', {
        text: '```kingdom-sheet\nkingdom: Brevoy Reborn\n```',
      });
      return;
    }

    const kingdomName = params.kingdom.trim();
    if (!this.data.kingdoms[kingdomName]) {
      this.data.kingdoms[kingdomName] = makeEmptyKingdom(kingdomName);
      await this.saveData(this.data);
    }
    const kingdom = this.data.kingdoms[kingdomName];

    const allSettlements = Object.values(this.data.settlements);

    const view = new KingdomSheetView(this.app, el, {
      kingdom,
      allSettlements,
      onKingdomChange: async next => {
        // Handle renames: if the user changed the kingdom name in the sheet,
        // re-key the kingdom record AND update any settlements that referenced
        // the old name.
        const oldName = kingdomName;
        const newName = next.name;
        if (newName !== oldName) {
          // Move the record
          this.data.kingdoms[newName] = next;
          delete this.data.kingdoms[oldName];
          // Re-link settlements
          for (const sid of Object.keys(this.data.settlements)) {
            if (this.data.settlements[sid].kingdomName === oldName) {
              this.data.settlements[sid].kingdomName = newName;
            }
          }
          new Notice(`Kingdom renamed: ${oldName} → ${newName}. Settlement references updated.`);
        } else {
          this.data.kingdoms[newName] = next;
        }
        await this.saveData(this.data);
      },
    });
    view.render();
  }

  /**
   * Render a ```kingdom-hex ``` block. Required field: `kingdom: <name>`.
   * If the named kingdom doesn't exist yet, it's created with defaults.
   */
  private async renderHexMapBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const params = parseKingdomBlock(source);
    if (!params.kingdom) {
      el.createEl('p', {
        text: '⚠ Kingdom Manager: missing required `kingdom:` field. Example:',
        cls: 'km-error',
      });
      el.createEl('pre', {
        text: '```kingdom-hex\nkingdom: Brevoy Reborn\n```',
      });
      return;
    }

    const kingdomName = params.kingdom.trim();
    if (!this.data.kingdoms[kingdomName]) {
      this.data.kingdoms[kingdomName] = makeEmptyKingdom(kingdomName);
      await this.saveData(this.data);
    }
    const kingdom = this.data.kingdoms[kingdomName];

    const view = new HexMapView(this.app, el, {
      kingdom,
      allSettlements: this.data.settlements,
      onKingdomChange: async next => {
        this.data.kingdoms[next.name] = next;
        await this.saveData(this.data);
      },
    });
    view.render();
  }

  /**
   * Render a ```kingdom-turn ``` block. Required field: `kingdom: <name>`.
   * Provides the per-turn activity selection workflow.
   */
  private async renderKingdomTurnBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const params = parseKingdomBlock(source);
    if (!params.kingdom) {
      el.createEl('p', {
        text: '⚠ Kingdom Manager: missing required `kingdom:` field. Example:',
        cls: 'km-error',
      });
      el.createEl('pre', {
        text: '```kingdom-turn\nkingdom: Brevoy Reborn\n```',
      });
      return;
    }

    const kingdomName = params.kingdom.trim();
    if (!this.data.kingdoms[kingdomName]) {
      this.data.kingdoms[kingdomName] = makeEmptyKingdom(kingdomName);
      await this.saveData(this.data);
    }
    const kingdom = this.data.kingdoms[kingdomName];

    const view = new KingdomTurnView(this.app, el, {
      kingdom,
      allSettlements: this.data.settlements,
      onKingdomChange: async next => {
        this.data.kingdoms[next.name] = next;
        await this.saveData(this.data);
      },
    });
    view.render();
  }

  /**
   * Render a ```kingdom-armies ``` block. Required field: `kingdom: <name>`.
   * Provides the full editable army roster.
   */
  private async renderKingdomArmiesBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const params = parseKingdomBlock(source);
    if (!params.kingdom) {
      el.createEl('p', {
        text: '⚠ Kingdom Manager: missing required `kingdom:` field. Example:',
        cls: 'km-error',
      });
      el.createEl('pre', {
        text: '```kingdom-armies\nkingdom: Brevoy Reborn\n```',
      });
      return;
    }

    const kingdomName = params.kingdom.trim();
    if (!this.data.kingdoms[kingdomName]) {
      this.data.kingdoms[kingdomName] = makeEmptyKingdom(kingdomName);
      await this.saveData(this.data);
    }
    const kingdom = this.data.kingdoms[kingdomName];

    const view = new KingdomArmiesView(this.app, el, {
      kingdom,
      allSettlements: this.data.settlements,
      onKingdomChange: async next => {
        this.data.kingdoms[next.name] = next;
        await this.saveData(this.data);
      },
    });
    view.render();
  }

  /**
   * Render a ```kingdom-events ``` block. Required field: `kingdom: <name>`.
   * Provides the dedicated event-list workspace.
   */
  private async renderKingdomEventsBlock(source: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) {
    const params = parseKingdomBlock(source);
    if (!params.kingdom) {
      el.createEl('p', {
        text: '⚠ Kingdom Manager: missing required `kingdom:` field. Example:',
        cls: 'km-error',
      });
      el.createEl('pre', {
        text: '```kingdom-events\nkingdom: Brevoy Reborn\n```',
      });
      return;
    }

    const kingdomName = params.kingdom.trim();
    if (!this.data.kingdoms[kingdomName]) {
      this.data.kingdoms[kingdomName] = makeEmptyKingdom(kingdomName);
      await this.saveData(this.data);
    }
    const kingdom = this.data.kingdoms[kingdomName];

    const view = new KingdomEventsView(this.app, el, {
      kingdom,
      allSettlements: this.data.settlements,
      onKingdomChange: async next => {
        this.data.kingdoms[next.name] = next;
        await this.saveData(this.data);
      },
    });
    view.render();
  }
}

// Parse the simple key:value block format. Tolerant of blank lines and `#` comments.
function parseSettlementBlock(source: string): SettlementBlockParams {
  const out: SettlementBlockParams = { id: '' };
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'id') out.id = value;
    else if (key === 'name') out.name = value;
    else if (key === 'kingdom') out.kingdom = value;
    else if (key === 'capital') out.capital = /^(true|yes|1)$/i.test(value);
  }
  return out;
}

interface KingdomBlockParams {
  kingdom: string;
}

/** Parse a ```kingdom-sheet ``` block. Only `kingdom:` is required. */
function parseKingdomBlock(source: string): KingdomBlockParams {
  const out: KingdomBlockParams = { kingdom: '' };
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'kingdom') out.kingdom = value;
  }
  return out;
}

/** Convert an ArrayBuffer to a base64 data URL of the given MIME type. */
function bytesToDataUrl(bytes: ArrayBuffer, mime: string): string {
  const u8 = new Uint8Array(bytes);
  let binary = '';
  // Process in chunks to avoid blowing the call stack on big files.
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Insert a codeblock at the cursor with proper spacing — adds a leading
 * blank line if the cursor isn't at the start of an empty line.
 */
function insertBlockAtCursor(editor: Editor, blockText: string): void {
  const cursor = editor.getCursor();
  const currentLine = editor.getLine(cursor.line);
  const needsLeadingNewline = currentLine.length > 0 || cursor.ch > 0;
  const text = (needsLeadingNewline ? '\n\n' : '') + blockText + '\n';
  editor.replaceRange(text, cursor);
}

/**
 * Slugify a free-form name into a stable settlement id. Lowercase, replaces
 * runs of non-alphanumeric with single hyphens, trims hyphens off ends.
 */
function slugifyForId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'settlement';
}
