// =============================================================
// KingdomArmiesView — full army roster editor
// =============================================================
// Layout:
//   1. Header (kingdom name + total count + status summary)
//   2. Toolbar (recruit new army, status filter)
//   3. Roster: one card per army with:
//      - identity (name, level, type — all editable)
//      - stat block (AC, HP slider, Maneuver, Morale, Attack, Damage)
//      - status + conditions
//      - tactics (multi-pick from level/type-appropriate list)
//      - gear (per-slot pickers)
//      - house-rules-override + notes free-text fields
//      - action buttons: Train / Garrison / Deploy / Recover / Disband / Delete
//
// All edits commit through onKingdomChange and trigger a full re-render.

import { App, Notice } from 'obsidian';
import {
  computeArmyRosterSummary,
  deleteArmy,
  deployArmy,
  disbandArmy,
  garrisonArmy,
  recoverArmy,
  recruitArmyForKingdom,
  trainArmy,
} from './kingdom';
import {
  ARMY_TYPE_DESCRIPTIONS,
  ARMY_TYPE_LABELS,
  ARMY_CONDITION_DESCRIPTIONS,
  ARMY_CONDITION_LABELS,
  GEAR_BY_ID,
  GEAR_SLOT_LABELS,
  ARMY_STATUS_LABELS,
  TACTIC_BY_ID,
  baseStatsFor,
  gearAvailableFor,
  tacticSlotsForLevel,
  tacticsAvailableFor,
  type ArmyCondition,
  type ArmyState,
  type ArmyStatus,
  type ArmyType,
  type GearSlot,
} from './armies';
import type { KingdomState, SettlementState } from './types';

export interface KingdomArmiesOptions {
  kingdom: KingdomState;
  /** All settlements in the vault — view filters internally by kingdomName. */
  allSettlements: Record<string, SettlementState>;
  onKingdomChange: (next: KingdomState) => Promise<void>;
}

const ARMY_TYPES: ArmyType[] = ['infantry', 'cavalry', 'skirmisher', 'siege'];
const STATUSES: ArmyStatus[] = ['mobilized', 'garrisoned', 'recovering', 'defeated', 'disbanded'];
const ALL_CONDITIONS: ArmyCondition[] = ['weakened', 'efficient', 'fortified', 'mired', 'fatigued', 'pinned', 'shaken', 'recovered'];
const GEAR_SLOTS: GearSlot[] = ['armour', 'weapon', 'magical', 'consumable'];

/** Statuses to show by default (excludes disbanded). */
const DEFAULT_STATUSES: ArmyStatus[] = ['mobilized', 'garrisoned', 'recovering', 'defeated'];

export class KingdomArmiesView {
  private app: App;
  private rootEl: HTMLElement;
  private opts: KingdomArmiesOptions;
  private statusFilter: Set<ArmyStatus> = new Set(DEFAULT_STATUSES);

  constructor(app: App, rootEl: HTMLElement, opts: KingdomArmiesOptions) {
    this.app = app;
    this.rootEl = rootEl;
    this.opts = opts;
  }

  render() {
    this.rootEl.empty();
    this.rootEl.addClass('km-army-root');

    this.renderHeader();
    this.renderToolbar();
    this.renderRoster();
  }

  // ===========================================================
  // Header
  // ===========================================================
  private renderHeader() {
    const k = this.opts.kingdom;
    const summary = computeArmyRosterSummary(k);

    const head = this.rootEl.createDiv({ cls: 'km-army-header' });
    head.createEl('h3', { text: `${k.name} — Armies` });
    const stats = head.createDiv({ cls: 'km-army-headerstats' });
    stats.createSpan({ text: `${summary.total} total · ` });
    const parts: string[] = [];
    for (const s of STATUSES) {
      if (summary.byStatus[s] > 0) {
        parts.push(`${summary.byStatus[s]} ${ARMY_STATUS_LABELS[s].toLowerCase()}`);
      }
    }
    stats.createSpan({ text: parts.join(' · ') });

    if (summary.warnings.length > 0) {
      const warnBox = this.rootEl.createDiv({ cls: 'km-army-warnings' });
      warnBox.createEl('h5', { text: 'Roster warnings' });
      const ul = warnBox.createEl('ul');
      for (const w of summary.warnings) ul.createEl('li', { text: w });
    }
  }

  // ===========================================================
  // Toolbar
  // ===========================================================
  private renderToolbar() {
    const k = this.opts.kingdom;
    const bar = this.rootEl.createDiv({ cls: 'km-army-toolbar' });

    const newBtn = bar.createEl('button', { text: '+ Recruit army', cls: 'mod-cta' });
    newBtn.addEventListener('click', async () => {
      const army = recruitArmyForKingdom(k, `New Army`, Math.max(1, k.level), 'infantry', false);
      await this.commit();
      this.render();
      // Scroll the new card into view
      this.rootEl.querySelector(`[data-army-id="${army.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      new Notice(`Recruited ${army.name}.`);
    });

    // Status filter chips
    const filterBox = bar.createDiv({ cls: 'km-army-filter' });
    filterBox.createSpan({ text: 'Show:', cls: 'km-army-filter-label' });
    for (const s of STATUSES) {
      const chip = filterBox.createEl('button', {
        text: ARMY_STATUS_LABELS[s],
        cls: 'km-army-filter-chip',
      });
      if (this.statusFilter.has(s)) chip.addClass('is-active');
      chip.addEventListener('click', () => {
        if (this.statusFilter.has(s)) this.statusFilter.delete(s);
        else this.statusFilter.add(s);
        this.render();
      });
    }
  }

  // ===========================================================
  // Roster
  // ===========================================================
  private renderRoster() {
    const k = this.opts.kingdom;
    const summary = computeArmyRosterSummary(k);
    const visibleArmies = summary.armies.filter(a => this.statusFilter.has(a.status));

    if (k.armies && Object.keys(k.armies).length === 0) {
      const empty = this.rootEl.createDiv({ cls: 'km-army-empty' });
      empty.createEl('p', { text: 'No armies in this kingdom yet. Click "Recruit army" above to add one, or use the Recruit Army activity in the Leadership phase.' });
      return;
    }
    if (visibleArmies.length === 0) {
      const empty = this.rootEl.createDiv({ cls: 'km-army-empty' });
      empty.createEl('p', { text: 'No armies match the current filter. Toggle status chips above to show more.' });
      return;
    }

    const grid = this.rootEl.createDiv({ cls: 'km-army-grid' });
    for (const army of visibleArmies) {
      grid.appendChild(this.renderArmyCard(army));
    }
  }

  private renderArmyCard(army: ArmyState): HTMLElement {
    const k = this.opts.kingdom;
    const card = document.createElement('div');
    card.className = `km-army-card km-army-status-${army.status}`;
    card.setAttr('data-army-id', army.id);

    // ---- Identity row ----
    const id = card.createDiv({ cls: 'km-army-id' });

    const nameInput = id.createEl('input', {
      type: 'text',
      cls: 'km-army-name',
      attr: { value: army.name, placeholder: 'Army name' },
    });
    nameInput.addEventListener('change', async () => {
      army.name = nameInput.value.trim() || 'Unnamed Army';
      await this.commit();
      this.render();
    });

    const typeSel = id.createEl('select', { cls: 'km-army-type' });
    for (const t of ARMY_TYPES) {
      const opt = typeSel.createEl('option', { value: t, text: ARMY_TYPE_LABELS[t] });
      if (army.type === t) opt.selected = true;
    }
    typeSel.setAttr('title', ARMY_TYPE_DESCRIPTIONS[army.type]);
    typeSel.addEventListener('change', async () => {
      army.type = typeSel.value as ArmyType;
      // Re-derive max HP for new type at same level; preserve HP percentage
      const newStats = baseStatsFor(army.level, army.type);
      const ratio = army.maxHp > 0 ? army.hp / army.maxHp : 1;
      army.maxHp = newStats.hp;
      army.hp = Math.round(newStats.hp * ratio);
      await this.commit();
      this.render();
    });

    const lvlWrap = id.createDiv({ cls: 'km-army-lvl' });
    lvlWrap.createSpan({ text: 'Lvl', cls: 'km-army-lvl-label' });
    const lvlInput = lvlWrap.createEl('input', {
      type: 'number',
      attr: { min: '1', max: '20', value: `${army.level}` },
    });
    lvlInput.addEventListener('change', async () => {
      const newLevel = Math.max(1, Math.min(20, parseInt(lvlInput.value, 10) || 1));
      const oldLevel = army.level;
      if (newLevel !== oldLevel) {
        const oldMax = army.maxHp;
        army.level = newLevel;
        const stats = baseStatsFor(army.level, army.type);
        army.maxHp = stats.hp;
        const ratio = oldMax > 0 ? army.hp / oldMax : 1;
        army.hp = Math.round(stats.hp * ratio);
      }
      await this.commit();
      this.render();
    });

    const statusSel = id.createEl('select', { cls: 'km-army-status-sel' });
    for (const s of STATUSES) {
      const opt = statusSel.createEl('option', { value: s, text: ARMY_STATUS_LABELS[s] });
      if (army.status === s) opt.selected = true;
    }
    statusSel.addEventListener('change', async () => {
      army.status = statusSel.value as ArmyStatus;
      await this.commit();
      this.render();
    });

    // ---- Stat block ----
    const stats = baseStatsFor(army.level, army.type);
    const sb = card.createDiv({ cls: 'km-army-statblock' });

    this.statBox(sb, 'AC', `${stats.ac}`);
    this.renderHpBox(sb, army);
    this.statBox(sb, 'Maneuver', `+${stats.maneuver}`);
    this.statBox(sb, 'Morale', `+${stats.morale}`);
    this.statBox(sb, 'Attack', `+${stats.attackMod}`);
    this.statBox(sb, 'Damage die', `1d${stats.damageDie}`);

    // ---- Location ----
    const locRow = card.createDiv({ cls: 'km-army-row' });
    locRow.createEl('label', { text: 'Location' });
    const myset = Object.entries(this.opts.allSettlements)
      .filter(([_, s]) => s.kingdomName === k.name);
    if (army.status === 'garrisoned') {
      const setSel = locRow.createEl('select');
      setSel.createEl('option', { value: '', text: '— Choose settlement —' });
      for (const [sid, s] of myset) {
        const opt = setSel.createEl('option', { value: sid, text: s.name });
        if (army.settlementId === sid) opt.selected = true;
      }
      setSel.addEventListener('change', async () => {
        army.settlementId = setSel.value || undefined;
        await this.commit();
      });
    } else if (army.status === 'mobilized') {
      // Hex coordinate input
      const hexInput = locRow.createEl('input', {
        type: 'text',
        attr: { value: army.hexKey ?? '', placeholder: 'q,r (e.g. 0,0)' },
      });
      hexInput.addEventListener('change', async () => {
        const v = hexInput.value.trim();
        // Validate "n,n" format
        if (v && !/^-?\d+,-?\d+$/.test(v)) {
          new Notice('Hex coordinate must be in the form q,r (e.g., 0,0 or -1,2).');
          hexInput.value = army.hexKey ?? '';
          return;
        }
        army.hexKey = v || undefined;
        await this.commit();
      });
    } else {
      locRow.createSpan({ cls: 'km-army-location-na', text: '— not deployed —' });
    }

    // ---- Conditions (checkboxes) ----
    const condRow = card.createDiv({ cls: 'km-army-row km-army-conditions' });
    condRow.createEl('label', { text: 'Conditions' });
    const condGrid = condRow.createDiv({ cls: 'km-army-cond-grid' });
    for (const c of ALL_CONDITIONS) {
      const chip = condGrid.createEl('button', { text: ARMY_CONDITION_LABELS[c], cls: 'km-army-cond-chip' });
      chip.setAttr('title', ARMY_CONDITION_DESCRIPTIONS[c]);
      if (army.conditions.includes(c)) chip.addClass('is-active');
      chip.addEventListener('click', async () => {
        if (army.conditions.includes(c)) {
          army.conditions = army.conditions.filter(x => x !== c);
        } else {
          army.conditions.push(c);
        }
        await this.commit();
        this.render();
      });
    }

    // ---- Tactics ----
    const slots = tacticSlotsForLevel(army.level);
    const tactRow = card.createDiv({ cls: 'km-army-row km-army-tactics' });
    const tactLabel = tactRow.createEl('label', { text: `Tactics (${army.tactics.length}/${slots})` });
    if (army.tactics.length > slots) {
      tactLabel.addClass('km-army-overslot');
      tactLabel.setAttr('title', `Over slot capacity by ${army.tactics.length - slots}.`);
    }
    const tactList = tactRow.createDiv({ cls: 'km-army-tactic-list' });
    for (const tid of army.tactics) {
      const t = TACTIC_BY_ID[tid];
      const chip = tactList.createSpan({ cls: 'km-army-tactic-chip' });
      chip.createSpan({ text: t?.name ?? tid });
      chip.setAttr('title', t?.description ?? '');
      const x = chip.createEl('button', { text: '×', cls: 'km-army-chip-x' });
      x.addEventListener('click', async () => {
        army.tactics = army.tactics.filter(id => id !== tid);
        await this.commit();
        this.render();
      });
    }
    // Picker for adding a new tactic
    const tactPicker = tactRow.createEl('select', { cls: 'km-army-tactic-picker' });
    tactPicker.createEl('option', { value: '', text: '+ Add tactic…' });
    const available = tacticsAvailableFor(army.level, army.type).filter(t => !army.tactics.includes(t.id));
    for (const t of available) {
      const opt = tactPicker.createEl('option', { value: t.id, text: `Lvl ${t.level} — ${t.name}` });
      opt.setAttr('title', t.description);
    }
    tactPicker.addEventListener('change', async () => {
      const sel = tactPicker.value;
      if (sel) {
        army.tactics.push(sel);
        await this.commit();
        this.render();
      }
    });

    // ---- Gear (per-slot pickers) ----
    const gearRow = card.createDiv({ cls: 'km-army-row km-army-gear' });
    gearRow.createEl('label', { text: 'Gear' });
    const gearGrid = gearRow.createDiv({ cls: 'km-army-gear-grid' });

    // Single-slot: armour, weapon
    for (const slot of ['armour', 'weapon'] as GearSlot[]) {
      const gc = gearGrid.createDiv({ cls: 'km-army-gear-cell' });
      gc.createEl('span', { text: GEAR_SLOT_LABELS[slot] + ':', cls: 'km-army-gear-slot-label' });
      const gpicker = gc.createEl('select');
      gpicker.createEl('option', { value: '', text: '— None —' });
      const available = gearAvailableFor(army.level, slot);
      const currentId = army.gear[slot];
      for (const g of available) {
        const opt = gpicker.createEl('option', { value: g.id, text: `${g.name} (${g.rpCost} RP)` });
        opt.setAttr('title', g.effect);
        if (currentId === g.id) opt.selected = true;
      }
      gpicker.addEventListener('change', async () => {
        army.gear[slot] = (gpicker.value || undefined) as any;
        await this.commit();
        this.render();
      });
    }

    // Multi-slot: magical, consumable (chip list + picker)
    for (const slot of ['magical', 'consumable'] as GearSlot[]) {
      const gc = gearGrid.createDiv({ cls: 'km-army-gear-cell km-army-gear-multi' });
      gc.createEl('span', { text: GEAR_SLOT_LABELS[slot] + ':', cls: 'km-army-gear-slot-label' });
      const list = gc.createDiv({ cls: 'km-army-gear-multi-list' });
      const ids = (army.gear[slot] as string[]) ?? [];
      for (const gid of ids) {
        const g = GEAR_BY_ID[gid];
        const chip = list.createSpan({ cls: 'km-army-gear-chip' });
        chip.createSpan({ text: g?.name ?? gid });
        chip.setAttr('title', g?.effect ?? '');
        const x = chip.createEl('button', { text: '×', cls: 'km-army-chip-x' });
        x.addEventListener('click', async () => {
          army.gear[slot] = ids.filter(id => id !== gid) as any;
          await this.commit();
          this.render();
        });
      }
      const gpicker = gc.createEl('select');
      gpicker.createEl('option', { value: '', text: '+ Add…' });
      const available = gearAvailableFor(army.level, slot).filter(g => !ids.includes(g.id));
      for (const g of available) {
        const opt = gpicker.createEl('option', { value: g.id, text: `${g.name} (${g.rpCost} RP)` });
        opt.setAttr('title', g.effect);
      }
      gpicker.addEventListener('change', async () => {
        if (gpicker.value) {
          const next = [...ids, gpicker.value];
          (army.gear as any)[slot] = next;
          await this.commit();
          this.render();
        }
      });
    }

    // ---- House rules override ----
    const overrideRow = card.createDiv({ cls: 'km-army-row' });
    overrideRow.createEl('label', { text: 'House rules / overrides' });
    const overrideTa = overrideRow.createEl('textarea', { cls: 'km-army-override' });
    overrideTa.value = army.houseRulesOverride ?? '';
    overrideTa.placeholder = 'Table-side adjudications: corrected stats, custom tactics, special status…';
    overrideTa.addEventListener('change', async () => {
      army.houseRulesOverride = overrideTa.value || undefined;
      await this.commit();
    });

    // ---- Notes ----
    const notesRow = card.createDiv({ cls: 'km-army-row' });
    notesRow.createEl('label', { text: 'Notes' });
    const notesTa = notesRow.createEl('textarea', { cls: 'km-army-notes' });
    notesTa.value = army.notes ?? '';
    notesTa.placeholder = 'Captains, history, recent battles…';
    notesTa.addEventListener('change', async () => {
      army.notes = notesTa.value || undefined;
      await this.commit();
    });

    // ---- Action buttons ----
    const actions = card.createDiv({ cls: 'km-army-actions' });

    const trainBtn = actions.createEl('button', { text: 'Train (+1 lvl)' });
    trainBtn.addEventListener('click', async () => {
      if (army.level >= 20) {
        new Notice(`${army.name} is already at max level.`);
        return;
      }
      trainArmy(army, 1);
      await this.commit();
      this.render();
      new Notice(`${army.name} trained to level ${army.level}.`);
    });

    const garrBtn = actions.createEl('button', { text: 'Garrison' });
    garrBtn.addEventListener('click', async () => {
      // Pick a settlement; if there's only one, use it directly
      if (myset.length === 0) {
        new Notice('No settlements in this kingdom yet to garrison in.');
        return;
      }
      const target = myset[0][0]; // default to first; user can change in dropdown
      garrisonArmy(army, target);
      await this.commit();
      this.render();
      new Notice(`${army.name} garrisoned at ${this.opts.allSettlements[target]?.name ?? target}.`);
    });

    const deployBtn = actions.createEl('button', { text: 'Deploy' });
    deployBtn.addEventListener('click', async () => {
      deployArmy(army, army.hexKey);
      await this.commit();
      this.render();
      new Notice(`${army.name} mobilised.`);
    });

    const recoverBtn = actions.createEl('button', { text: 'Recover' });
    recoverBtn.addEventListener('click', async () => {
      recoverArmy(army, false);
      await this.commit();
      this.render();
      new Notice(`${army.name} recovering: HP ${army.hp}/${army.maxHp}.`);
    });

    const fullRecBtn = actions.createEl('button', { text: 'Full restore' });
    fullRecBtn.addEventListener('click', async () => {
      recoverArmy(army, true);
      await this.commit();
      this.render();
      new Notice(`${army.name} fully restored.`);
    });

    const disbandBtn = actions.createEl('button', { text: 'Disband', cls: 'mod-warning' });
    disbandBtn.addEventListener('click', async () => {
      disbandArmy(army);
      await this.commit();
      this.render();
      new Notice(`${army.name} disbanded.`);
    });

    const delBtn = actions.createEl('button', { text: 'Delete', cls: 'mod-danger' });
    delBtn.addEventListener('click', async () => {
      const confirmed = confirm(`Permanently delete ${army.name}? This cannot be undone.`);
      if (!confirmed) return;
      deleteArmy(k, army.id);
      await this.commit();
      this.render();
    });

    return card;
  }

  // ===========================================================
  // Helpers
  // ===========================================================
  private statBox(parent: HTMLElement, label: string, value: string) {
    const cell = parent.createDiv({ cls: 'km-army-statbox' });
    cell.createDiv({ cls: 'km-army-statvalue', text: value });
    cell.createDiv({ cls: 'km-army-statlabel', text: label });
  }

  private renderHpBox(parent: HTMLElement, army: ArmyState) {
    const cell = parent.createDiv({ cls: 'km-army-statbox km-army-hpbox' });
    const wrap = cell.createDiv({ cls: 'km-army-hp-wrap' });
    const hpInput = wrap.createEl('input', {
      type: 'number',
      cls: 'km-army-hp-input',
      attr: { min: '0', max: `${army.maxHp}`, value: `${army.hp}` },
    });
    wrap.createSpan({ text: ` / ${army.maxHp}`, cls: 'km-army-hp-max' });
    hpInput.addEventListener('change', async () => {
      const v = Math.max(0, Math.min(army.maxHp, parseInt(hpInput.value, 10) || 0));
      army.hp = v;
      // Auto-update status: defeated when hp = 0; mobilized if rising from 0 (kept manual otherwise)
      if (army.hp === 0 && army.status !== 'disbanded') army.status = 'defeated';
      await this.commit();
      this.render();
    });
    cell.createDiv({ cls: 'km-army-statlabel', text: 'HP' });
  }

  private async commit() {
    await this.opts.onKingdomChange(this.opts.kingdom);
  }
}
