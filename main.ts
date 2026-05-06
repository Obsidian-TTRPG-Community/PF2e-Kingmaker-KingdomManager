// =============================================================
// KingdomSetupModal — onboarding wizard for new kingdoms
// =============================================================
// Captures the full set of starting fields a new user would otherwise have
// to type by hand into a kingdom-sheet (or click into the live editor for):
//   - kingdom name, level, government, alignment
//   - charter, heartland, language
//   - capital settlement name (optional; creates a settlement record)
//   - which codeblocks to insert
//
// Returns the result via a Promise resolved when the user clicks Insert.
// On Cancel (or clicking the close X / pressing Escape), resolves with null.
//
// The modal does NOT itself mutate plugin data or insert text — that's the
// caller's job, so the modal stays cleanly testable and the main.ts handler
// can decide whether to bail out (e.g. duplicate name detection).

import { App, Modal } from 'obsidian';
import { ALIGNMENTS, GOVERNMENT_LABELS, type Alignment, type Government } from './types';

export interface KingdomSetupResult {
  /** Required. Used as the kingdom: <name> field in every codeblock. */
  kingdomName: string;
  level: number;
  government: Government;
  alignment: Alignment;
  charter: string;
  heartland: string;
  language: string;
  /**
   * Optional. If non-empty, the caller creates a settlement record with
   * this name and isCapital=true, linked to the kingdom. The settlement's
   * own codeblock (uses the existing `kingdom` block-type) is inserted
   * separately.
   */
  capitalName: string;
  /** Which codeblocks the user wants in their note. */
  includeBlocks: {
    sheet: boolean;
    capital: boolean; // settlement codeblock for the capital — only meaningful if capitalName is set
    hex: boolean;
    turn: boolean;
    armies: boolean;
    events: boolean;
  };
}

const ALIGNMENT_LABELS: Record<Alignment, string> = {
  LG: 'Lawful Good',
  NG: 'Neutral Good',
  CG: 'Chaotic Good',
  LN: 'Lawful Neutral',
  N: 'Neutral',
  CN: 'Chaotic Neutral',
  LE: 'Lawful Evil',
  NE: 'Neutral Evil',
  CE: 'Chaotic Evil',
};

export class KingdomSetupModal extends Modal {
  private result: KingdomSetupResult | null = null;
  private resolvePromise: ((value: KingdomSetupResult | null) => void) | null = null;

  // Form state (lives between renders)
  private state: KingdomSetupResult = {
    kingdomName: '',
    level: 1,
    government: 'feudalism',
    alignment: 'N',
    charter: '',
    heartland: '',
    language: 'Common',
    capitalName: '',
    includeBlocks: {
      sheet: true,
      capital: true,
      hex: true,
      turn: true,
      armies: true,
      events: true,
    },
  };

  constructor(app: App, defaults?: Partial<KingdomSetupResult>) {
    super(app);
    if (defaults) {
      this.state = { ...this.state, ...defaults, includeBlocks: { ...this.state.includeBlocks, ...(defaults.includeBlocks ?? {}) } };
    }
    this.titleEl.setText('Set up a new kingdom');
  }

  /** Open the modal and return a Promise that resolves on close. */
  open(): Promise<KingdomSetupResult | null> | any {
    super.open();
    return new Promise<KingdomSetupResult | null>(resolve => {
      this.resolvePromise = resolve;
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('km-setup-modal');

    // Friendly intro
    contentEl.createEl('p', {
      cls: 'km-setup-intro',
      text: 'This wizard creates a kingdom record and inserts the codeblocks you choose at your cursor. You can edit any field later by clicking on it in the kingdom sheet — the values here are just starting points.',
    });

    // ---- Kingdom name (required) ----
    const nameRow = this.field(contentEl, 'Kingdom name', { required: true });
    const nameInput = nameRow.createEl('input', {
      type: 'text',
      attr: {
        placeholder: 'e.g. Brevoy Reborn',
        value: this.state.kingdomName,
      },
    });
    nameInput.addEventListener('input', () => {
      this.state.kingdomName = nameInput.value;
      this.updateInsertEnabled();
    });
    // Auto-focus the name field on open
    setTimeout(() => nameInput.focus(), 50);

    // ---- Level (1-20) ----
    const levelRow = this.field(contentEl, 'Starting level');
    const levelInput = levelRow.createEl('input', {
      type: 'number',
      attr: { min: '1', max: '20', value: `${this.state.level}` },
    });
    levelInput.addEventListener('change', () => {
      this.state.level = Math.max(1, Math.min(20, parseInt(levelInput.value, 10) || 1));
    });

    // ---- Two-column layout for government + alignment ----
    const grid2 = contentEl.createDiv({ cls: 'km-setup-grid2' });

    const govRow = this.field(grid2, 'Government');
    const govSelect = govRow.createEl('select');
    for (const [key, label] of Object.entries(GOVERNMENT_LABELS)) {
      const opt = govSelect.createEl('option', { value: key, text: label });
      if (this.state.government === key) opt.selected = true;
    }
    govSelect.addEventListener('change', () => {
      this.state.government = govSelect.value as Government;
    });

    const alignRow = this.field(grid2, 'Alignment');
    const alignSelect = alignRow.createEl('select');
    for (const a of ALIGNMENTS) {
      const opt = alignSelect.createEl('option', { value: a, text: `${a} — ${ALIGNMENT_LABELS[a]}` });
      if (this.state.alignment === a) opt.selected = true;
    }
    alignSelect.addEventListener('change', () => {
      this.state.alignment = alignSelect.value as Alignment;
    });

    // ---- Charter / heartland / language ----
    const charterRow = this.field(contentEl, 'Charter', { hint: 'How did the kingdom come to be? (Conquest, Expansion, Exploration, etc.)' });
    const charterInput = charterRow.createEl('input', {
      type: 'text',
      attr: { value: this.state.charter, placeholder: 'e.g. Exploration' },
    });
    charterInput.addEventListener('input', () => {
      this.state.charter = charterInput.value;
    });

    const grid2b = contentEl.createDiv({ cls: 'km-setup-grid2' });

    const heartlandRow = this.field(grid2b, 'Heartland', { hint: 'The kingdom\'s home terrain.' });
    const heartlandInput = heartlandRow.createEl('input', {
      type: 'text',
      attr: { value: this.state.heartland, placeholder: 'e.g. Forest' },
    });
    heartlandInput.addEventListener('input', () => {
      this.state.heartland = heartlandInput.value;
    });

    const langRow = this.field(grid2b, 'Common language');
    const langInput = langRow.createEl('input', {
      type: 'text',
      attr: { value: this.state.language, placeholder: 'Common' },
    });
    langInput.addEventListener('input', () => {
      this.state.language = langInput.value;
    });

    // ---- Capital settlement (optional) ----
    contentEl.createEl('h4', { text: 'Capital settlement (optional)', cls: 'km-setup-section-head' });
    const capitalHint = contentEl.createEl('p', { cls: 'km-setup-hint' });
    capitalHint.setText('Set a capital settlement name to pre-create the settlement record and its codeblock. You can also leave this blank and add settlements later.');

    const capRow = this.field(contentEl, 'Capital settlement name');
    const capInput = capRow.createEl('input', {
      type: 'text',
      attr: { placeholder: 'e.g. New Stetven', value: this.state.capitalName },
    });
    capInput.addEventListener('input', () => {
      this.state.capitalName = capInput.value;
      this.updateCapitalCheckbox();
    });

    // ---- Block checklist ----
    contentEl.createEl('h4', { text: 'Codeblocks to insert', cls: 'km-setup-section-head' });
    const blockGrid = contentEl.createDiv({ cls: 'km-setup-blocklist' });

    type BlockKey = keyof KingdomSetupResult['includeBlocks'];
    const blocks: { key: BlockKey; label: string; desc: string }[] = [
      { key: 'hex', label: 'Hex Map', desc: 'Territory map with terrain, worksites, and roads. Where the kingdom physically sits.' },
      { key: 'capital', label: 'Capital settlement', desc: 'Urban-grid editor for the capital. Only inserted if you set a capital name above.' },
      { key: 'sheet', label: 'Kingdom Sheet', desc: 'Identity, abilities, ruin, leadership, roll-up. The main bookkeeping view.' },
      { key: 'turn', label: 'Kingdom Turn', desc: 'Per-turn activity workflow with phase pills and half-auto rolling.' },
      { key: 'armies', label: 'Army Roster', desc: 'Editable army stat blocks with tactics and gear.' },
      { key: 'events', label: 'Event Log', desc: 'Active events, resolution, and continuous-event ticking.' },
    ];

    for (const b of blocks) {
      const row = blockGrid.createDiv({ cls: 'km-setup-blockrow' });
      const label = row.createEl('label', { cls: 'km-setup-blocklabel' });
      const cb = label.createEl('input', { type: 'checkbox', attr: { 'data-block': b.key } });
      cb.checked = this.state.includeBlocks[b.key];
      const titleSpan = label.createSpan({ cls: 'km-setup-blocktitle', text: b.label });
      cb.addEventListener('change', () => {
        this.state.includeBlocks[b.key] = cb.checked;
      });
      const descEl = row.createDiv({ cls: 'km-setup-blockdesc', text: b.desc });
      // The 'capital' option's enabled state depends on whether capitalName is set
      if (b.key === 'capital' && !this.state.capitalName.trim()) {
        cb.disabled = true;
        cb.checked = false;
        this.state.includeBlocks.capital = false;
        row.addClass('is-disabled');
        descEl.appendText(' (set a capital settlement name above to enable)');
      }
    }

    // ---- Buttons ----
    const buttons = contentEl.createDiv({ cls: 'km-setup-buttons' });
    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.result = null;
      this.close();
    });

    const insertBtn = buttons.createEl('button', { text: 'Create kingdom and insert blocks', cls: 'mod-cta' });
    insertBtn.addEventListener('click', () => {
      if (!this.state.kingdomName.trim()) {
        nameInput.focus();
        nameInput.addClass('is-error');
        return;
      }
      this.result = { ...this.state, kingdomName: this.state.kingdomName.trim() };
      this.close();
    });
    // Allow Enter key in the name input to submit (when name is filled in)
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && this.state.kingdomName.trim()) {
        e.preventDefault();
        insertBtn.click();
      }
    });

    // Set initial enabled state of the Insert button
    this.updateInsertEnabled();
  }

  onClose() {
    this.contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(this.result);
      this.resolvePromise = null;
    }
  }

  // -----------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------

  /**
   * Build a label + value-cell row. Returns the value cell (where you put
   * the input/select) so the caller can append to it.
   */
  private field(parent: HTMLElement, label: string, opts?: { required?: boolean; hint?: string }): HTMLElement {
    const row = parent.createDiv({ cls: 'km-setup-field' });
    const lbl = row.createEl('label', { text: label });
    if (opts?.required) {
      lbl.createSpan({ cls: 'km-setup-required', text: ' *' });
    }
    const valueCell = row.createDiv({ cls: 'km-setup-fieldvalue' });
    if (opts?.hint) {
      row.createDiv({ cls: 'km-setup-hint', text: opts.hint });
    }
    return valueCell;
  }

  /**
   * Re-evaluate the Insert button — disabled if the kingdom name is empty.
   * Done on every keystroke for a responsive feel.
   */
  private updateInsertEnabled() {
    // Find the Insert button (last button in the buttons row)
    const btn = this.contentEl.querySelector('.km-setup-buttons button.mod-cta') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = !this.state.kingdomName.trim();
    }
    // Also clear the error highlight from the name input if it's now non-empty
    const nameInput = this.contentEl.querySelector('.km-setup-field input[type="text"]') as HTMLInputElement | null;
    if (nameInput && this.state.kingdomName.trim()) {
      nameInput.removeClass('is-error');
    }
  }

  /**
   * Capital-block checkbox should auto-enable when capitalName has content,
   * auto-disable + uncheck when blanked.
   */
  private updateCapitalCheckbox() {
    const cb = this.contentEl.querySelector('input[data-block="capital"]') as HTMLInputElement | null;
    if (!cb) return;
    const row = cb.closest('.km-setup-blockrow') as HTMLElement | null;
    const descEl = row?.querySelector('.km-setup-blockdesc') as HTMLElement | null;
    if (this.state.capitalName.trim()) {
      cb.disabled = false;
      // Re-enable to true (matches default-on behaviour) when newly enabled
      if (!cb.checked) {
        cb.checked = true;
        this.state.includeBlocks.capital = true;
      }
      row?.removeClass('is-disabled');
      // Strip the "(set a capital ...)" suffix
      if (descEl && descEl.textContent?.endsWith('(set a capital settlement name above to enable)')) {
        descEl.setText(descEl.textContent.replace(' (set a capital settlement name above to enable)', ''));
      }
    } else {
      cb.disabled = true;
      cb.checked = false;
      this.state.includeBlocks.capital = false;
      row?.addClass('is-disabled');
      if (descEl && !descEl.textContent?.includes('(set a capital settlement name above to enable)')) {
        descEl.appendText(' (set a capital settlement name above to enable)');
      }
    }
  }
}
