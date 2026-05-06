// =============================================================
// UrbanGridView — render the 3×3 block / 6×6 lot Urban Grid
// =============================================================
// Layout:
//   [Header: settlement name + capital toggle + kingdom name]
//   [ Borders (top) ]
//   [Borders (left)] [Grid 6×6 with lot identifiers] [Borders (right)]
//   [ Borders (bottom) ]
//   [Infrastructure flags]                          [Settlement Summary panel]
//   [Kingdom panel: level + stockpiles, shared]

import { App, Notice } from 'obsidian';
import { BUILDINGS, imageFor } from './buildings';
import { BuildingPickerModal, type PickerResult } from './BuildingPickerModal';
import { computeSettlementSummary } from './summary';
import {
  GRID_LOTS_PER_SIDE,
  TOTAL_LOTS,
  TOTAL_BLOCKS,
  GRID_BLOCKS_PER_SIDE,
  LOTS_PER_BLOCK_SIDE,
  ITEM_TRADITION_LABELS,
  colRowToLot,
  lotIdentifier,
  lotIsOnWaterBorder,
  lotsInSameBlock,
  lotToBlock,
  lotToColRow,
  type SettlementState,
  type KingdomState,
  type BorderSide,
  type Placement,
  type ItemTradition,
} from './types';

export interface RenderOptions {
  state: SettlementState;
  kingdom: KingdomState;
  onSettlementChange: (next: SettlementState) => Promise<void>;
  onKingdomChange: (next: KingdomState) => Promise<void>;
}

export class UrbanGridView {
  private app: App;
  private rootEl: HTMLElement;
  private opts: RenderOptions;
  private lotMap = new Map<number, Placement>();

  constructor(app: App, rootEl: HTMLElement, opts: RenderOptions) {
    this.app = app;
    this.rootEl = rootEl;
    this.opts = opts;
  }

  render() {
    this.rootEl.empty();
    this.rootEl.addClass('km-root');
    this.rebuildLotMap();

    const layout = this.rootEl.createDiv({ cls: 'km-layout' });
    const left = layout.createDiv({ cls: 'km-left' });
    const right = layout.createDiv({ cls: 'km-right' });

    this.renderHeader(left);
    this.renderGrid(left);
    this.renderInfrastructure(left);
    this.renderKingdomPanel(left);
    this.renderSummary(right);
  }

  // ---------------------------------------------------------
  // Header
  // ---------------------------------------------------------
  private renderHeader(parent: HTMLElement) {
    const header = parent.createDiv({ cls: 'km-header' });

    const nameInput = header.createEl('input', {
      type: 'text',
      cls: 'km-name-input',
      attr: { placeholder: 'Settlement name', value: this.opts.state.name },
    });
    nameInput.addEventListener('change', async () => {
      this.opts.state.name = nameInput.value.trim() || 'Settlement';
      await this.commitSettlement();
    });

    const capitalLabel = header.createEl('label', { cls: 'km-capital-toggle' });
    const capitalCheckbox = capitalLabel.createEl('input', { type: 'checkbox' });
    capitalCheckbox.checked = this.opts.state.isCapital;
    capitalLabel.appendText(' Capital');
    capitalCheckbox.addEventListener('change', async () => {
      this.opts.state.isCapital = capitalCheckbox.checked;
      await this.commitSettlement();
      this.render();
    });

    header.createDiv({
      cls: 'km-kingdom-label',
      text: `Kingdom: ${this.opts.kingdom.name}`,
    });
  }

  // ---------------------------------------------------------
  // Grid + borders
  // ---------------------------------------------------------
  private renderGrid(parent: HTMLElement) {
    const wrap = parent.createDiv({ cls: 'km-grid-wrap' });

    this.renderBorderStrip(wrap, 'top');

    const middle = wrap.createDiv({ cls: 'km-grid-middle' });
    this.renderBorderStrip(middle, 'left');

    const grid = middle.createDiv({ cls: 'km-grid' });
    grid.style.setProperty('--km-cols', `${GRID_LOTS_PER_SIDE}`);
    grid.style.setProperty('--km-rows', `${GRID_LOTS_PER_SIDE}`);

    const renderedPlacements = new Set<string>();

    for (let row = 0; row < GRID_LOTS_PER_SIDE; row++) {
      for (let col = 0; col < GRID_LOTS_PER_SIDE; col++) {
        const lot = colRowToLot(col, row);
        const placement = this.lotMap.get(lot);

        const cell = grid.createDiv({ cls: 'km-cell', attr: { 'data-lot': `${lot}` } });
        cell.style.gridColumn = `${col + 1}`;
        cell.style.gridRow = `${row + 1}`;

        if (col % LOTS_PER_BLOCK_SIDE === 0) cell.addClass('km-block-edge-l');
        if (row % LOTS_PER_BLOCK_SIDE === 0) cell.addClass('km-block-edge-t');
        if (col % LOTS_PER_BLOCK_SIDE === LOTS_PER_BLOCK_SIDE - 1) cell.addClass('km-block-edge-r');
        if (row % LOTS_PER_BLOCK_SIDE === LOTS_PER_BLOCK_SIDE - 1) cell.addClass('km-block-edge-b');

        cell.addEventListener('click', () => this.handleCellClick(lot));

        if (placement && !renderedPlacements.has(placement.id)) {
          const meta = BUILDINGS[placement.buildingId];
          const span = this.computePlacementSpan(placement);
          if (span) {
            cell.style.gridColumn = `${span.col + 1} / span ${span.colSpan}`;
            cell.style.gridRow = `${span.row + 1} / span ${span.rowSpan}`;
            cell.addClass('km-placement');
            const url = imageFor(placement.buildingId);
            if (url) {
              cell.style.backgroundImage = `url(${url})`;
            } else {
              cell.addClass('km-placement-noimg');
              cell.createDiv({ cls: 'km-placement-name', text: meta?.name ?? placement.buildingId });
            }
            // Lot identifier overlay (shows the anchor's identifier)
            const lid = cell.createDiv({ cls: 'km-lot-id', text: lotIdentifier(lot) });
            lid.setAttr('aria-hidden', 'true');
            if (meta) cell.setAttr('title', `${meta.name} (Lvl ${meta.level}) · ${lotIdentifier(lot)} — ${meta.effects}`);
            renderedPlacements.add(placement.id);
          }
        } else if (placement && renderedPlacements.has(placement.id)) {
          cell.addClass('km-cell-hidden');
        } else {
          cell.addClass('km-cell-empty');
          cell.setAttr('title', `Empty lot ${lotIdentifier(lot)} · Block ${lotToBlock(lot) + 1}`);
          cell.createDiv({ cls: 'km-lot-id', text: lotIdentifier(lot) });
        }
      }
    }

    this.renderBorderStrip(middle, 'right');
    this.renderBorderStrip(wrap, 'bottom');
  }

  private computePlacementSpan(p: Placement): { col: number; row: number; colSpan: number; rowSpan: number } | null {
    if (p.lots.length === 0) return null;
    const coords = p.lots.map(lotToColRow);
    const minCol = Math.min(...coords.map(c => c.col));
    const minRow = Math.min(...coords.map(c => c.row));
    const maxCol = Math.max(...coords.map(c => c.col));
    const maxRow = Math.max(...coords.map(c => c.row));
    return {
      col: minCol,
      row: minRow,
      colSpan: maxCol - minCol + 1,
      rowSpan: maxRow - minRow + 1,
    };
  }

  // ---------------------------------------------------------
  // Border strips
  // ---------------------------------------------------------
  private renderBorderStrip(parent: HTMLElement, side: BorderSide) {
    const border = this.opts.state.borders[side];
    const strip = parent.createDiv({ cls: `km-border km-border-${side}` });

    const inner = strip.createDiv({ cls: 'km-border-inner' });
    inner.createSpan({ text: side.toUpperCase(), cls: 'km-border-label' });

    const water = inner.createEl('label', { cls: 'km-border-toggle' });
    const waterCb = water.createEl('input', { type: 'checkbox' });
    waterCb.checked = border.water;
    water.appendText(' Water');
    waterCb.addEventListener('change', async () => {
      border.water = waterCb.checked;
      await this.commitSettlement();
      this.render();
    });

    const bridge = inner.createEl('label', { cls: 'km-border-toggle' });
    const bridgeCb = bridge.createEl('input', { type: 'checkbox' });
    bridgeCb.checked = border.bridge;
    bridge.appendText(' Bridge');
    bridgeCb.addEventListener('change', async () => {
      border.bridge = bridgeCb.checked;
      await this.commitSettlement();
    });

    const wall = inner.createEl('label', { cls: 'km-border-toggle' });
    const wallSel = wall.createEl('select');
    wallSel.createEl('option', { value: 'none', text: 'No wall' });
    wallSel.createEl('option', { value: 'wood', text: 'Wood wall' });
    wallSel.createEl('option', { value: 'stone', text: 'Stone wall' });
    wallSel.value = border.wall;
    wallSel.addEventListener('change', async () => {
      border.wall = wallSel.value as 'none' | 'wood' | 'stone';
      await this.commitSettlement();
    });
  }

  // ---------------------------------------------------------
  // Infrastructure
  // ---------------------------------------------------------
  private renderInfrastructure(parent: HTMLElement) {
    const box = parent.createDiv({ cls: 'km-infra' });
    box.createEl('h4', { text: 'Infrastructure' });
    const items: { key: 'pavedStreets' | 'sewerSystem' | 'magicalStreetlamps'; label: string }[] = [
      { key: 'pavedStreets', label: 'Paved Streets' },
      { key: 'sewerSystem', label: 'Sewer System (-1 Consumption)' },
      { key: 'magicalStreetlamps', label: 'Magical Streetlamps' },
    ];
    for (const item of items) {
      const lbl = box.createEl('label', { cls: 'km-infra-toggle' });
      const cb = lbl.createEl('input', { type: 'checkbox' });
      cb.checked = this.opts.state.infrastructure[item.key];
      lbl.appendText(' ' + item.label);
      cb.addEventListener('change', async () => {
        this.opts.state.infrastructure[item.key] = cb.checked;
        await this.commitSettlement();
        this.render();
      });
    }
  }

  // ---------------------------------------------------------
  // Kingdom panel — level + stockpiles
  // ---------------------------------------------------------
  private renderKingdomPanel(parent: HTMLElement) {
    const box = parent.createDiv({ cls: 'km-kingdom-panel' });
    box.createEl('h4', { text: `Kingdom: ${this.opts.kingdom.name}` });

    // Kingdom level
    const levelRow = box.createDiv({ cls: 'km-kingdom-level' });
    levelRow.createEl('label', { text: 'Kingdom level' });
    const levelInput = levelRow.createEl('input', {
      type: 'number',
      attr: { min: '1', max: '20', value: `${this.opts.kingdom.level}` },
    });
    levelInput.addEventListener('change', async () => {
      const v = Math.max(1, Math.min(20, parseInt(levelInput.value, 10) || 1));
      this.opts.kingdom.level = v;
      await this.commitKingdom();
      this.render();
    });

    // Stockpiles
    const stocks = box.createDiv({ cls: 'km-stockpiles' });
    const stockItems: { key: keyof KingdomState['stockpiles']; label: string }[] = [
      { key: 'rp', label: 'RP' },
      { key: 'food', label: 'Food' },
      { key: 'lumber', label: 'Lumber' },
      { key: 'luxuries', label: 'Luxuries' },
      { key: 'ore', label: 'Ore' },
      { key: 'stone', label: 'Stone' },
    ];
    for (const item of stockItems) {
      const cell = stocks.createDiv({ cls: 'km-stock' });
      cell.createEl('label', { text: item.label });
      const input = cell.createEl('input', {
        type: 'number',
        attr: { min: '0', value: `${this.opts.kingdom.stockpiles[item.key]}` },
      });
      input.addEventListener('change', async () => {
        const v = Math.max(0, parseInt(input.value, 10) || 0);
        this.opts.kingdom.stockpiles[item.key] = v;
        await this.commitKingdom();
      });
    }
  }

  // ---------------------------------------------------------
  // Settlement summary panel
  // ---------------------------------------------------------
  private renderSummary(parent: HTMLElement) {
    const summary = computeSettlementSummary(this.opts.state, this.opts.kingdom);

    const head = parent.createDiv({ cls: 'km-summary-head' });
    head.createEl('h3', { text: this.opts.state.name || 'Settlement' });
    head.createEl('div', {
      cls: 'km-summary-type',
      text: `${summary.type} · Settlement Lvl ${summary.level} · Kingdom Lvl ${summary.kingdomLevel}`,
    });

    // Top-line stats
    const stats = parent.createDiv({ cls: 'km-summary-stats' });
    statBlock(stats, 'Filled blocks', `${summary.filledBlocks} / ${TOTAL_BLOCKS}`);
    statBlock(stats, 'Filled lots', `${summary.filledLots} / ${TOTAL_LOTS}`);
    statBlock(stats, 'Residential', `${summary.residentialLots} lots`);
    statBlock(stats, 'Population', formatPop(summary.population));
    statBlock(stats, 'Consumption', `${summary.consumption}`);
    statBlock(stats, 'Max item bonus', `+${summary.maxItemBonus}`);
    statBlock(stats, 'Influence', `${summary.influenceHexes} hex${summary.influenceHexes === 1 ? '' : 'es'}`);
    if (summary.hasCapitalSeat) statBlock(stats, 'Leadership', '3 / turn');

    // Item levels by tradition
    const il = parent.createDiv({ cls: 'km-summary-itemlevels' });
    il.createEl('h4', { text: 'Available item levels' });
    const ilTable = il.createEl('table', { cls: 'km-itemlevels-table' });
    const ilHead = ilTable.createEl('tr');
    ilHead.createEl('th', { text: 'Tradition' });
    ilHead.createEl('th', { text: 'Level' });
    ilHead.createEl('th', { text: 'Sources' });
    const traditions: ItemTradition[] = ['base', 'alchemical', 'arcane', 'divine', 'primal', 'luxurious'];
    for (const t of traditions) {
      const data = summary.itemLevels[t];
      const tr = ilTable.createEl('tr');
      tr.createEl('td', { text: ITEM_TRADITION_LABELS[t] });
      const lvl = tr.createEl('td');
      lvl.setText(`${data.level}${data.offset > 0 ? ` (+${data.offset})` : ''}`);
      if (data.offset > 0) lvl.addClass('km-il-bumped');
      tr.createEl('td', {
        text: data.sources.length ? data.sources.map(id => BUILDINGS[id]?.name ?? id).join(', ') : '—',
      });
    }

    // Consumption breakdown
    if (summary.consumptionBreakdown.length > 1) {
      const det = parent.createDiv({ cls: 'km-summary-consumption' });
      det.createEl('h4', { text: 'Consumption breakdown' });
      const list = det.createEl('ul');
      for (const item of summary.consumptionBreakdown) {
        const li = list.createEl('li');
        const sign = item.value > 0 ? '+' : '';
        li.setText(`${item.label}: ${sign}${item.value}`);
      }
    }

    // Capacity bonuses
    const cb = summary.capacityBonuses;
    if (cb.food + cb.lumber + cb.ore + cb.stone + cb.luxuries > 0) {
      const cap = parent.createDiv({ cls: 'km-summary-capacities' });
      cap.createEl('h4', { text: 'Commodity capacity bonuses' });
      const ul = cap.createEl('ul');
      if (cb.food) ul.createEl('li', { text: `+${cb.food} Food (Granaries)` });
      if (cb.lumber) ul.createEl('li', { text: `+${cb.lumber} Lumber (Lumberyards)` });
      if (cb.ore) ul.createEl('li', { text: `+${cb.ore} Ore (Foundries)` });
      if (cb.stone) ul.createEl('li', { text: `+${cb.stone} Stone (Stonemasons)` });
      if (cb.luxuries) ul.createEl('li', { text: `+${cb.luxuries} Luxuries (Secure Warehouses)` });
    }

    // Activity bonuses (the big matrix)
    if (summary.activityBonuses.length > 0) {
      const ab = parent.createDiv({ cls: 'km-summary-activities' });
      ab.createEl('h4', { text: 'Activity bonuses' });
      const tbl = ab.createEl('table', { cls: 'km-activity-table' });
      const head = tbl.createEl('tr');
      head.createEl('th', { text: 'Activity' });
      head.createEl('th', { text: 'Bonus' });
      head.createEl('th', { text: 'Source(s)' });
      for (const e of summary.activityBonuses) {
        const tr = tbl.createEl('tr');
        tr.createEl('td', { text: e.label });
        tr.createEl('td', { text: `+${e.bonus}` });
        tr.createEl('td', {
          text: e.sources.map(id => BUILDINGS[id]?.name ?? id).join(', '),
        });
      }
    }

    // Buildings list
    if (summary.buildings.length > 0) {
      const blds = parent.createDiv({ cls: 'km-summary-buildings' });
      blds.createEl('h4', { text: 'Buildings' });
      const ul = blds.createEl('ul');
      for (const b of summary.buildings) {
        const li = ul.createEl('li');
        li.setText(`${b.name}${b.count > 1 ? ` × ${b.count}` : ''}`);
      }
    }

    // Warnings
    if (summary.warnings.length > 0) {
      const warn = parent.createDiv({ cls: 'km-summary-warnings' });
      warn.createEl('h4', { text: 'Warnings' });
      const ul = warn.createEl('ul');
      for (const w of summary.warnings) ul.createEl('li', { text: w });
    }
  }

  // ---------------------------------------------------------
  // Click handling — kingdom-level filtering applied here
  // ---------------------------------------------------------
  private async handleCellClick(lot: number) {
    const existing = this.lotMap.get(lot);

    const blockLots = lotsInSameBlock(lot);
    const occupiedInBlock = blockLots.filter(l => this.lotMap.has(l) && l !== lot).length;

    let allowedLots: (1 | 2 | 4)[];
    if (existing) {
      const sz = existing.lots.length as 1 | 2 | 4;
      allowedLots = sz === 4 ? [1, 2, 4] : sz === 2 ? [1, 2] : [1];
    } else {
      const freeIncludingClick = blockLots.length - occupiedInBlock;
      if (freeIncludingClick >= 4) allowedLots = [1, 2, 4];
      else if (freeIncludingClick >= 2) allowedLots = [1, 2];
      else allowedLots = [1];
    }

    const hasWater = lotIsOnWaterBorder(lot, this.opts.state);

    const modal = new BuildingPickerModal(this.app, {
      allowedLots,
      defaultLots: allowedLots[0],
      maxKingdomLevel: this.opts.kingdom.level,
      canClear: !!existing,
      hasWaterAdjacent: hasWater,
    });
    const result: PickerResult = await modal.open();

    if (!result) return;

    if (result.kind === 'clear' && existing) {
      this.opts.state.placements = this.opts.state.placements.filter(p => p.id !== existing.id);
      await this.commitSettlement();
      this.render();
      return;
    }

    if (result.kind === 'place') {
      const meta = BUILDINGS[result.buildingId];
      if (!meta) return;
      // Hard-block over-level builds (UI also disables, but defense in depth)
      if (meta.level > this.opts.kingdom.level) {
        new Notice(`${meta.name} requires kingdom level ${meta.level}. Current: ${this.opts.kingdom.level}.`);
        return;
      }
      const lots = this.findLotsForPlacement(lot, meta.lots as 1 | 2 | 4);
      if (lots === null) {
        new Notice(`Couldn't fit a ${meta.lots}-lot building here.`);
        return;
      }
      this.opts.state.placements = this.opts.state.placements.filter(p => p.lots.every(l => !lots.includes(l)));
      this.opts.state.placements.push({
        id: cryptoRandomId(),
        buildingId: meta.id,
        lots,
      });
      await this.commitSettlement();
      this.render();
    }
  }

  private findLotsForPlacement(anchorLot: number, size: 1 | 2 | 4): number[] | null {
    const blockLots = lotsInSameBlock(anchorLot);
    if (size === 4) return blockLots;
    if (size === 1) return [anchorLot];

    const occupied = (l: number) => {
      const p = this.lotMap.get(l);
      if (!p) return false;
      if (p.lots.includes(anchorLot) && p.lots.length === 1) return false;
      return true;
    };

    const anchorCR = lotToColRow(anchorLot);
    const blockOthers = blockLots.filter(l => l !== anchorLot);
    const ranked = blockOthers
      .map(l => {
        const cr = lotToColRow(l);
        const dCol = Math.abs(cr.col - anchorCR.col);
        const dRow = Math.abs(cr.row - anchorCR.row);
        const orth = dCol + dRow === 1;
        return { lot: l, orth, dCol, dRow };
      })
      .sort((a, b) => Number(b.orth) - Number(a.orth) || (a.dCol + a.dRow) - (b.dCol + b.dRow));

    for (const cand of ranked) {
      if (!occupied(cand.lot)) return [anchorLot, cand.lot];
    }
    return null;
  }

  // ---------------------------------------------------------
  // Commit + helpers
  // ---------------------------------------------------------
  private async commitSettlement() {
    await this.opts.onSettlementChange(this.opts.state);
  }
  private async commitKingdom() {
    await this.opts.onKingdomChange(this.opts.kingdom);
  }

  private rebuildLotMap() {
    this.lotMap.clear();
    for (const p of this.opts.state.placements) {
      for (const l of p.lots) this.lotMap.set(l, p);
    }
  }
}

function statBlock(parent: HTMLElement, label: string, value: string) {
  const cell = parent.createDiv({ cls: 'km-stat' });
  cell.createDiv({ cls: 'km-stat-value', text: value });
  cell.createDiv({ cls: 'km-stat-label', text: label });
}

function formatPop(p: { min: number; max: number }): string {
  if (p.min === 0 && p.max === 0) return '0';
  if (p.min === p.max) return `${p.min.toLocaleString()}`;
  return `${p.min.toLocaleString()}–${p.max.toLocaleString()}`;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as Crypto).randomUUID();
  return 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export { GRID_LOTS_PER_SIDE, GRID_BLOCKS_PER_SIDE, LOTS_PER_BLOCK_SIDE, TOTAL_LOTS, TOTAL_BLOCKS };
