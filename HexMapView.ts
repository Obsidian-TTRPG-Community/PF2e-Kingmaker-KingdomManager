// =============================================================
// BuildingPickerModal — choose a building to place
// =============================================================
// Filters by:
//   - footprint (allowedLots = lot counts that fit the click context)
//   - kingdom level (max level cap, since you can't build above kingdom level)
//   - search text

import { App, Modal } from 'obsidian';
import { BUILDINGS, imageFor } from './buildings';
import type { BuildingMetadata } from './types';

export type PickerResult =
  | { kind: 'place'; buildingId: string; note?: string }
  | { kind: 'clear' }
  | null;

export interface PickerOptions {
  allowedLots: (1 | 2 | 4)[];
  defaultLots?: 1 | 2 | 4;
  /** Kingdom level — buildings above this are shown but disabled. */
  maxKingdomLevel: number;
  canClear: boolean;
  hasWaterAdjacent: boolean;
}

export class BuildingPickerModal extends Modal {
  private result: PickerResult = null;
  private opts: PickerOptions;
  private currentLots: 1 | 2 | 4;
  private searchInput!: HTMLInputElement;
  private listContainer!: HTMLElement;
  private resolvePromise: ((r: PickerResult) => void) | null = null;
  private showOverLevel = false;

  constructor(app: App, opts: PickerOptions) {
    super(app);
    this.opts = opts;
    this.currentLots = opts.defaultLots ?? opts.allowedLots[0] ?? 1;
    this.titleEl.setText('Build a Structure');
  }

  open(): Promise<PickerResult> {
    super.open();
    return new Promise(resolve => {
      this.resolvePromise = resolve;
    });
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('km-picker');

    const toolbar = contentEl.createDiv({ cls: 'km-picker-toolbar' });

    if (this.opts.canClear) {
      const clearBtn = toolbar.createEl('button', { text: 'Clear Lot(s)', cls: 'km-picker-clear' });
      clearBtn.addEventListener('click', () => {
        this.result = { kind: 'clear' };
        this.close();
      });
    }

    const footprintGroup = toolbar.createDiv({ cls: 'km-picker-footprint' });
    footprintGroup.createSpan({ text: 'Lots:' });
    for (const lots of [1, 2, 4] as const) {
      const enabled = this.opts.allowedLots.includes(lots);
      const btn = footprintGroup.createEl('button', { text: `${lots}` });
      if (!enabled) btn.disabled = true;
      if (lots === this.currentLots) btn.addClass('is-active');
      btn.addEventListener('click', () => {
        if (!enabled) return;
        this.currentLots = lots;
        footprintGroup.querySelectorAll('button').forEach(b => b.removeClass('is-active'));
        btn.addClass('is-active');
        this.renderList();
      });
    }

    this.searchInput = toolbar.createEl('input', {
      type: 'text',
      placeholder: 'Search buildings…',
      cls: 'km-picker-search',
    });
    this.searchInput.addEventListener('input', () => this.renderList());

    // "Show over kingdom level" toggle
    const overLabel = toolbar.createEl('label', { cls: 'km-picker-overlevel' });
    const overCb = overLabel.createEl('input', { type: 'checkbox' });
    overLabel.appendText(` Show structures above kingdom level (${this.opts.maxKingdomLevel})`);
    overCb.addEventListener('change', () => {
      this.showOverLevel = overCb.checked;
      this.renderList();
    });

    this.listContainer = contentEl.createDiv({ cls: 'km-picker-list' });
    this.renderList();
  }

  onClose() {
    this.contentEl.empty();
    this.resolvePromise?.(this.result);
    this.resolvePromise = null;
  }

  private renderList() {
    const search = this.searchInput?.value.trim().toLowerCase() ?? '';
    const lotFilter = this.currentLots;

    const matches = Object.values(BUILDINGS)
      .filter(b => b.lots === lotFilter)
      .filter(b => this.showOverLevel || b.level <= this.opts.maxKingdomLevel)
      .filter(b => !search || b.name.toLowerCase().includes(search) || b.tags.join(' ').toLowerCase().includes(search))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

    this.listContainer.empty();

    if (matches.length === 0) {
      this.listContainer.createEl('p', { text: 'No buildings match these filters.', cls: 'km-picker-empty' });
      return;
    }

    for (const meta of matches) {
      this.listContainer.appendChild(this.renderEntry(meta));
    }
  }

  private renderEntry(meta: BuildingMetadata): HTMLElement {
    const row = document.createElement('div');
    row.className = 'km-picker-entry';
    const overLevel = meta.level > this.opts.maxKingdomLevel;
    if (overLevel) row.addClass('km-picker-entry-disabled');

    // Thumbnail
    const thumb = row.createDiv({ cls: 'km-picker-thumb' });
    const url = imageFor(meta.id);
    if (url) {
      const img = thumb.createEl('img');
      img.src = url;
      img.alt = meta.name;
    } else {
      thumb.setText(meta.name[0]);
    }

    // Info column
    const info = row.createDiv({ cls: 'km-picker-info' });
    const titleRow = info.createDiv({ cls: 'km-picker-title-row' });
    titleRow.createEl('strong', { text: meta.name });
    titleRow.createSpan({
      text: ` · Level ${meta.level} · ${meta.lots} lot${meta.lots === 1 ? '' : 's'}`,
      cls: 'km-picker-meta',
    });

    if (meta.tags.length) {
      const tags = info.createDiv({ cls: 'km-picker-tags' });
      for (const t of meta.tags) tags.createEl('span', { text: t, cls: 'km-tag' });
    }

    info.createDiv({ cls: 'km-picker-desc', text: meta.description });

    const stats = info.createDiv({ cls: 'km-picker-stats' });
    stats.createEl('div').innerHTML = `<strong>Cost:</strong> ${escapeHtml(meta.cost)}`;
    stats.createEl('div').innerHTML = `<strong>Construction:</strong> ${escapeHtml(meta.construction)}`;
    if (meta.upgradeFrom) stats.createEl('div').innerHTML = `<strong>Upgrades from:</strong> ${escapeHtml(meta.upgradeFrom)}`;
    if (meta.upgradeTo) stats.createEl('div').innerHTML = `<strong>Upgrades to:</strong> ${escapeHtml(meta.upgradeTo)}`;
    if (meta.ruin) stats.createEl('div').innerHTML = `<strong>Ruin:</strong> ${escapeHtml(meta.ruin)}`;
    stats.createEl('div').innerHTML = `<strong>Effects:</strong> ${escapeHtml(meta.effects)}`;

    if (overLevel) {
      info.createDiv({
        cls: 'km-picker-warn',
        text: `⚠ Above kingdom level ${this.opts.maxKingdomLevel} — cannot be built yet.`,
      });
    }

    const requiresWater = ['pier', 'lumberyard', 'waterfront'].includes(meta.id);
    if (requiresWater && !this.opts.hasWaterAdjacent) {
      info.createDiv({
        cls: 'km-picker-warn',
        text: '⚠ This structure requires a lot adjacent to a Water Border.',
      });
    }

    const actions = row.createDiv({ cls: 'km-picker-actions' });
    const pickBtn = actions.createEl('button', { text: 'Build', cls: 'mod-cta' });
    if (overLevel) pickBtn.disabled = true;
    pickBtn.addEventListener('click', () => {
      this.result = { kind: 'place', buildingId: meta.id };
      this.close();
    });

    return row;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
