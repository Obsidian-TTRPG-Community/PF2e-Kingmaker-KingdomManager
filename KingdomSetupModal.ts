// =============================================================
// KingdomSheetView — render a full kingdom sheet
// =============================================================
// Scope (heavy-version v0.5.0): identity, abilities, ruin, leadership,
// turn tracker, event log, cross-settlement roll-up. The rendered codeblock
// is registered for ```kingdom-sheet ``` source.
//
// Sections, top to bottom:
//   1. Identity panel
//   2. Status bar (level, XP, unrest, fame, control DC, ruin penalty)
//   3. Stockpiles + capacity (synced with settlement-derived caps)
//   4. Ability scores grid (16 abilities × {score, prof, mod})
//   5. Ruin tracker (4 tracks with advance/clear buttons)
//   6. Leadership roster (11 roles, name + PC + invested)
//   7. Turn tracker (turn number, phase, advance button)
//   8. Cross-settlement roll-up (population, consumption, item levels, activities)
//   9. Settlement directory (link list)
//  10. Event log (free-form entries with title + body)
//  11. Notes (free-form textarea)
//  12. Coming-soon banner for hex map / armies / events table

import { App, Notice } from 'obsidian';
import {
  abilityModifier,
  canLevelUp,
  computeArmyRosterSummary,
  computeEventSummary,
  controlDC,
  computeRollup,
  kingdomSize,
  leadershipActivitySlots,
  leadershipStatus,
  ruinAtThreshold,
  ruinTotalPenalty,
  skillModifier,
  type SettlementRollup,
} from './kingdom';
import {
  ALIGNMENTS,
  GOVERNMENT_LABELS,
  ITEM_TRADITION_LABELS,
  KINGDOM_ABILITIES,
  KINGDOM_ABILITY_LABELS,
  LEADERSHIP_ROLE_ABILITY,
  LEADERSHIP_ROLE_LABELS,
  LEADERSHIP_VACANCY_PENALTY,
  PROFICIENCY_BONUS,
  RUIN_LABELS,
  TURN_PHASE_LABELS,
  type Alignment,
  type Government,
  type KingdomAbility,
  type KingdomEvent,
  type KingdomState,
  type LeadershipRole,
  type Proficiency,
  type RuinName,
  type SettlementState,
} from './types';
import { FEAT_BY_ID, FEAT_TYPE_LABELS } from './feats';
import { EVENT_BY_ID } from './events';
import { KingdomLevelUpModal } from './KingdomLevelUpModal';

export interface KingdomSheetOptions {
  kingdom: KingdomState;
  /** All settlements in the vault — view filters internally by kingdomName. */
  allSettlements: SettlementState[];
  onKingdomChange: (next: KingdomState) => Promise<void>;
}

const PROFICIENCY_RANKS: Proficiency[] = ['untrained', 'trained', 'expert', 'master', 'legendary'];

export class KingdomSheetView {
  private app: App;
  private rootEl: HTMLElement;
  private opts: KingdomSheetOptions;

  constructor(app: App, rootEl: HTMLElement, opts: KingdomSheetOptions) {
    this.app = app;
    this.rootEl = rootEl;
    this.opts = opts;
  }

  render() {
    this.rootEl.empty();
    this.rootEl.addClass('km-kingdom-sheet');

    this.renderLevelUpBanner();
    this.renderIdentity();
    this.renderStatusBar();
    this.renderStockpiles();
    this.renderAbilities();
    this.renderRuin();
    this.renderLeadership();
    this.renderFeats();
    this.renderArmiesSummary();
    this.renderActiveEventsSummary();
    this.renderRollup();
    this.renderSettlementDirectory();
    this.renderEventLog();
    this.renderNotes();
  }

  // =============================================================
  // 1. Identity panel
  // =============================================================
  private renderIdentity() {
    const k = this.opts.kingdom;
    const sec = this.section('km-ks-identity', 'Identity');

    const grid = sec.createDiv({ cls: 'km-ks-identity-grid' });

    // Name
    const nameRow = grid.createDiv({ cls: 'km-ks-field' });
    nameRow.createEl('label', { text: 'Kingdom name' });
    const nameInput = nameRow.createEl('input', { type: 'text', attr: { value: k.name } });
    nameInput.addEventListener('change', async () => {
      const newName = nameInput.value.trim();
      if (!newName || newName === k.name) {
        nameInput.value = k.name;
        return;
      }
      // Renaming a kingdom is delicate: settlements reference by name. We
      // change the name in place and let main.ts handle the side-effect of
      // updating settlement.kingdomName references on next save (or here if needed).
      k.name = newName;
      await this.commit();
      this.render();
    });

    // Government
    this.selectField(grid, 'Government', k.government, GOVERNMENT_LABELS, async v => {
      k.government = v as Government;
      await this.commit();
    });

    // Alignment
    const alignmentLabels: Record<Alignment, string> = {
      LG: 'Lawful Good', NG: 'Neutral Good', CG: 'Chaotic Good',
      LN: 'Lawful Neutral', N: 'Neutral', CN: 'Chaotic Neutral',
      LE: 'Lawful Evil', NE: 'Neutral Evil', CE: 'Chaotic Evil',
    };
    const alignMap = {} as Record<string, string>;
    for (const a of ALIGNMENTS) alignMap[a] = alignmentLabels[a];
    this.selectField(grid, 'Alignment', k.alignment, alignMap, async v => {
      k.alignment = v as Alignment;
      await this.commit();
    });

    // Charter
    this.textField(grid, 'Charter', k.charter, async v => {
      k.charter = v;
      await this.commit();
    });

    // Heartland
    this.textField(grid, 'Heartland', k.heartland, async v => {
      k.heartland = v;
      await this.commit();
    });

    // Language
    this.textField(grid, 'Language', k.language, async v => {
      k.language = v;
      await this.commit();
    });
  }

  // =============================================================
  // 2. Status bar
  // =============================================================
  private renderStatusBar() {
    const k = this.opts.kingdom;
    const sec = this.rootEl.createDiv({ cls: 'km-ks-statusbar' });

    const size = kingdomSize(k.claimedHexes);
    const cdc = controlDC(k);
    const rp = ruinTotalPenalty(k);

    this.statBox(sec, 'Level', `${k.level}`, this.numberInputCallback(1, 20, k.level, async v => {
      k.level = v;
      await this.commit();
      this.render();
    }));
    this.statBox(sec, 'XP', `${k.xp} / 1000`, this.numberInputCallback(0, 99999, k.xp, async v => {
      k.xp = v;
      // Auto-level if XP >= 1000
      if (k.xp >= 1000 && k.level < 20) {
        new Notice(`${k.name} reached XP threshold — consider levelling up!`);
      }
      await this.commit();
      this.render();
    }));
    // Auto-derive claimed hex count from the hex map if it's been populated.
    // Otherwise allow manual entry (for users who haven't built the hex map yet).
    const derivedHexes = Object.values(k.hexes).filter(h => h.claimed).length;
    const hasHexMap = Object.keys(k.hexes).length > 0;
    if (hasHexMap && k.claimedHexes !== derivedHexes) {
      k.claimedHexes = derivedHexes;
    }
    if (hasHexMap) {
      this.statBox(sec, 'Hexes', `${k.claimedHexes}`);
    } else {
      this.statBox(sec, 'Hexes', `${k.claimedHexes}`, this.numberInputCallback(0, 9999, k.claimedHexes, async v => {
        k.claimedHexes = v;
        await this.commit();
        this.render();
      }));
    }
    this.statBox(sec, 'Size', size);
    this.statBox(sec, 'Control DC', `${cdc}`);
    this.statBox(sec, 'Unrest', `${k.unrest}`, this.numberInputCallback(0, 999, k.unrest, async v => {
      k.unrest = v;
      await this.commit();
    }));
    this.statBox(sec, k.isInfamous ? 'Infamy' : 'Fame', `${k.fame}`, this.numberInputCallback(0, 999, k.fame, async v => {
      k.fame = v;
      await this.commit();
    }));
    if (rp > 0) this.statBox(sec, 'Ruin Penalty', `−${rp}`);
  }

  // =============================================================
  // 3. Stockpiles + capacity
  // =============================================================
  private renderStockpiles() {
    const k = this.opts.kingdom;
    const sec = this.section('km-ks-stockpiles', 'Resources & stockpiles');

    const rollup = computeRollup(k, this.opts.allSettlements);
    const caps = rollup.totalCapacityBonuses;

    const stockGrid = sec.createDiv({ cls: 'km-ks-stockpile-grid' });
    const items: { key: keyof KingdomState['stockpiles']; label: string; capBonus?: number; defaultCap?: number }[] = [
      { key: 'rp', label: 'RP', defaultCap: undefined },
      { key: 'food', label: 'Food', capBonus: caps.food, defaultCap: 4 },
      { key: 'lumber', label: 'Lumber', capBonus: caps.lumber, defaultCap: 4 },
      { key: 'luxuries', label: 'Luxuries', capBonus: caps.luxuries, defaultCap: 4 },
      { key: 'ore', label: 'Ore', capBonus: caps.ore, defaultCap: 4 },
      { key: 'stone', label: 'Stone', capBonus: caps.stone, defaultCap: 4 },
    ];

    for (const item of items) {
      const cell = stockGrid.createDiv({ cls: 'km-ks-stockpile-cell' });
      cell.createEl('label', { text: item.label });
      const input = cell.createEl('input', {
        type: 'number',
        attr: { min: '0', value: `${k.stockpiles[item.key]}` },
      });
      input.addEventListener('change', async () => {
        const v = Math.max(0, parseInt(input.value, 10) || 0);
        k.stockpiles[item.key] = v;
        await this.commit();
      });

      if (item.defaultCap !== undefined) {
        const totalCap = item.defaultCap + (item.capBonus ?? 0);
        const capEl = cell.createDiv({ cls: 'km-ks-stockpile-cap' });
        capEl.setText(`/ ${totalCap}`);
        if ((item.capBonus ?? 0) > 0) {
          capEl.setAttr('title', `Base ${item.defaultCap} + ${item.capBonus} from buildings`);
          capEl.addClass('km-ks-cap-bumped');
        }
      }
    }
  }

  // =============================================================
  // 4. Ability scores
  // =============================================================
  private renderAbilities() {
    const k = this.opts.kingdom;
    const sec = this.section('km-ks-abilities', 'Ability scores');

    const note = sec.createEl('p', { cls: 'km-ks-note' });
    note.setText(`Skill modifier = ability mod + proficiency bonus + level (if trained or higher).`);

    const tbl = sec.createEl('table', { cls: 'km-ks-ability-table' });
    const head = tbl.createEl('tr');
    head.createEl('th', { text: 'Ability' });
    head.createEl('th', { text: 'Score' });
    head.createEl('th', { text: 'Mod' });
    head.createEl('th', { text: 'Prof' });
    head.createEl('th', { text: 'Skill' });

    for (const ab of KINGDOM_ABILITIES) {
      const tr = tbl.createEl('tr');
      tr.createEl('td', { text: KINGDOM_ABILITY_LABELS[ab] });

      // Score input
      const scoreCell = tr.createEl('td');
      const scoreInput = scoreCell.createEl('input', {
        type: 'number',
        cls: 'km-ks-score-input',
        attr: { min: '1', max: '30', value: `${k.abilities[ab]}` },
      });
      scoreInput.addEventListener('change', async () => {
        const v = Math.max(1, Math.min(30, parseInt(scoreInput.value, 10) || 10));
        k.abilities[ab] = v;
        await this.commit();
        this.render();
      });

      // Mod
      const mod = abilityModifier(k.abilities[ab]);
      tr.createEl('td', {
        cls: 'km-ks-ability-mod',
        text: mod >= 0 ? `+${mod}` : `${mod}`,
      });

      // Proficiency
      const profCell = tr.createEl('td');
      const profSel = profCell.createEl('select', { cls: 'km-ks-prof-select' });
      for (const p of PROFICIENCY_RANKS) {
        const opt = profSel.createEl('option', { value: p, text: p[0].toUpperCase() + p.slice(1) });
        if (k.proficiencies[ab] === p) opt.selected = true;
      }
      profSel.addEventListener('change', async () => {
        k.proficiencies[ab] = profSel.value as Proficiency;
        await this.commit();
        this.render();
      });

      // Skill modifier
      const skill = skillModifier(k, ab);
      const skillCell = tr.createEl('td', {
        cls: 'km-ks-skill-mod',
        text: skill >= 0 ? `+${skill}` : `${skill}`,
      });
      // Tooltip showing the breakdown
      const profBonus = PROFICIENCY_BONUS[k.proficiencies[ab]];
      const levelBonus = k.proficiencies[ab] === 'untrained' ? 0 : k.level;
      skillCell.setAttr(
        'title',
        `${mod >= 0 ? '+' : ''}${mod} (mod) + ${profBonus} (prof) + ${levelBonus} (level) = ${skill >= 0 ? '+' : ''}${skill}`,
      );
    }
  }

  // =============================================================
  // 5. Ruin tracker
  // =============================================================
  private renderRuin() {
    const k = this.opts.kingdom;
    const sec = this.section('km-ks-ruin', 'Ruin');

    const grid = sec.createDiv({ cls: 'km-ks-ruin-grid' });
    const ruins: RuinName[] = ['corruption', 'crime', 'decay', 'strife'];
    for (const ruin of ruins) {
      const r = k.ruin[ruin];
      const cell = grid.createDiv({ cls: 'km-ks-ruin-cell' });

      const head = cell.createDiv({ cls: 'km-ks-ruin-head' });
      head.createEl('h5', { text: RUIN_LABELS[ruin] });
      if (r.penalty > 0) head.createEl('span', { cls: 'km-ks-ruin-pen', text: `−${r.penalty}` });

      const valueRow = cell.createDiv({ cls: 'km-ks-ruin-value' });
      valueRow.createEl('label', { text: 'Points' });
      const valueInput = valueRow.createEl('input', {
        type: 'number',
        attr: { min: '0', value: `${r.value}` },
      });
      valueInput.addEventListener('change', async () => {
        r.value = Math.max(0, parseInt(valueInput.value, 10) || 0);
        await this.commit();
        this.render();
      });

      const threshRow = cell.createDiv({ cls: 'km-ks-ruin-value' });
      threshRow.createEl('label', { text: 'Threshold' });
      const threshInput = threshRow.createEl('input', {
        type: 'number',
        attr: { min: '1', value: `${r.threshold}` },
      });
      threshInput.addEventListener('change', async () => {
        r.threshold = Math.max(1, parseInt(threshInput.value, 10) || 10);
        await this.commit();
      });

      const penRow = cell.createDiv({ cls: 'km-ks-ruin-value' });
      penRow.createEl('label', { text: 'Penalty' });
      const penInput = penRow.createEl('input', {
        type: 'number',
        attr: { min: '0', value: `${r.penalty}` },
      });
      penInput.addEventListener('change', async () => {
        r.penalty = Math.max(0, parseInt(penInput.value, 10) || 0);
        await this.commit();
        this.render();
      });

      // Threshold-trip indicator
      if (ruinAtThreshold(k, ruin)) {
        cell.addClass('km-ks-ruin-tripped');
        const warn = cell.createDiv({ cls: 'km-ks-ruin-warn' });
        warn.setText(`At threshold (${r.value} ≥ ${r.threshold}). Next +1 increases penalty.`);
      }

      // Action buttons: +1 / -1 / advance penalty
      const actions = cell.createDiv({ cls: 'km-ks-ruin-actions' });
      const plusBtn = actions.createEl('button', { text: '+1' });
      plusBtn.addEventListener('click', async () => {
        r.value += 1;
        if (r.value > r.threshold) {
          r.penalty += 1;
          r.value = 0;
          new Notice(`${RUIN_LABELS[ruin]} threshold passed! Penalty now −${r.penalty}, points reset to 0.`);
        }
        await this.commit();
        this.render();
      });
      const minusBtn = actions.createEl('button', { text: '−1' });
      minusBtn.addEventListener('click', async () => {
        r.value = Math.max(0, r.value - 1);
        await this.commit();
        this.render();
      });
    }
  }

  // =============================================================
  // 6. Leadership roster
  // =============================================================
  private renderLeadership() {
    const k = this.opts.kingdom;
    const sec = this.section('km-ks-leadership', 'Leadership');

    const status = leadershipStatus(k);
    const slots = leadershipActivitySlots(k, this.opts.allSettlements.filter(s => s.kingdomName === k.name));
    const summary = sec.createEl('p', { cls: 'km-ks-note' });
    summary.setText(
      `${status.filledRoles.length} / ${k.leadership.length} roles filled · ${status.pcRoles.length} PC leader${status.pcRoles.length === 1 ? '' : 's'} · ${slots} Leadership activity slot${slots === 1 ? '' : 's'} per turn` +
      (status.unrestPerTurnFromVacancies > 0 ? ` · +${status.unrestPerTurnFromVacancies} Unrest/turn from vacancies` : ''),
    );

    const tbl = sec.createEl('table', { cls: 'km-ks-leadership-table' });
    const head = tbl.createEl('tr');
    head.createEl('th', { text: 'Role' });
    head.createEl('th', { text: 'Leader' });
    head.createEl('th', { text: 'PC?' });
    head.createEl('th', { text: 'Invested' });
    head.createEl('th', { text: 'Boosts' });

    for (const slot of k.leadership) {
      const tr = tbl.createEl('tr');
      const isVacant = slot.name.trim().length === 0;
      if (isVacant) tr.addClass('km-ks-role-vacant');
      else if (!slot.invested) tr.addClass('km-ks-role-uninvested');

      // Role name + tooltip with vacancy penalty
      const roleCell = tr.createEl('td');
      roleCell.setText(LEADERSHIP_ROLE_LABELS[slot.role]);
      roleCell.setAttr('title', `Vacancy penalty: ${LEADERSHIP_VACANCY_PENALTY[slot.role]}`);

      // Leader name input
      const nameCell = tr.createEl('td');
      const nameInput = nameCell.createEl('input', {
        type: 'text',
        attr: { placeholder: 'Vacant', value: slot.name },
      });
      nameInput.addEventListener('change', async () => {
        slot.name = nameInput.value.trim();
        await this.commit();
        this.render();
      });

      // PC checkbox
      const pcCell = tr.createEl('td');
      const pcCb = pcCell.createEl('input', { type: 'checkbox' });
      pcCb.checked = slot.isPC;
      pcCb.addEventListener('change', async () => {
        slot.isPC = pcCb.checked;
        await this.commit();
        this.render();
      });

      // Invested checkbox
      const invCell = tr.createEl('td');
      const invCb = invCell.createEl('input', { type: 'checkbox' });
      invCb.checked = slot.invested;
      invCb.disabled = isVacant;
      invCb.addEventListener('change', async () => {
        slot.invested = invCb.checked;
        await this.commit();
        this.render();
      });

      // Boosted ability
      const ab = LEADERSHIP_ROLE_ABILITY[slot.role];
      const boostCell = tr.createEl('td');
      if (ab) {
        boostCell.setText(KINGDOM_ABILITY_LABELS[ab]);
        if (slot.invested && !isVacant) boostCell.addClass('km-ks-boost-active');
      } else {
        boostCell.setText('—');
      }
    }

    // Vacancy / uninvested warnings
    if (status.vacantRoles.length > 0 || status.uninvestedRoles.length > 0) {
      const warnBox = sec.createDiv({ cls: 'km-ks-leadership-warnings' });
      if (status.vacantRoles.length > 0) {
        warnBox.createEl('h5', { text: 'Vacant roles' });
        const ul = warnBox.createEl('ul');
        for (const slot of status.vacantRoles) {
          const li = ul.createEl('li');
          li.setText(`${LEADERSHIP_ROLE_LABELS[slot.role]} — ${LEADERSHIP_VACANCY_PENALTY[slot.role]}`);
        }
      }
      if (status.uninvestedRoles.length > 0) {
        warnBox.createEl('h5', { text: 'Uninvested leaders' });
        const ul = warnBox.createEl('ul');
        for (const slot of status.uninvestedRoles) {
          const li = ul.createEl('li');
          li.setText(`${LEADERSHIP_ROLE_LABELS[slot.role]} (${slot.name}) — gains no ability bonus until invested.`);
        }
      }
    }
  }

  // =============================================================
  // Level-up banner (only renders when XP ≥ 1000)
  // =============================================================
  private renderLevelUpBanner() {
    const k = this.opts.kingdom;
    if (!canLevelUp(k)) return;
    const banner = this.rootEl.createDiv({ cls: 'km-ks-levelup-banner' });
    const text = banner.createDiv({ cls: 'km-ks-levelup-text' });
    text.createEl('strong', { text: '★ Level up available!' });
    text.appendText(` ${k.name} has ${k.xp} XP — enough to advance from level ${k.level} to ${k.level + 1}.`);
    const btn = banner.createEl('button', { text: 'Open level-up wizard', cls: 'mod-cta' });
    btn.addEventListener('click', () => {
      const modal = new KingdomLevelUpModal(this.app, {
        kingdom: k,
        onApplied: async () => {
          await this.commit();
          this.render();
        },
      });
      modal.open();
    });
  }

  // =============================================================
  // Feats section (renders any time the kingdom has chosen feats)
  // =============================================================
  private renderFeats() {
    const k = this.opts.kingdom;
    if (!k.feats || k.feats.length === 0) return;
    const sec = this.section('km-ks-feats', 'Kingdom feats');

    // Render each feat as a card with name + type tag + level + description
    const list = sec.createDiv({ cls: 'km-ks-feats-list' });
    for (const id of k.feats) {
      const feat = FEAT_BY_ID[id];
      if (!feat) {
        // Could happen if an old kingdom has a feat id from a prior version
        const item = list.createDiv({ cls: 'km-ks-feat-item' });
        item.createEl('strong', { text: id });
        item.appendText(' (unknown feat — may be from an older catalogue)');
        continue;
      }
      const item = list.createDiv({ cls: `km-ks-feat-item km-ks-feat-type-${feat.type}` });
      const head = item.createDiv({ cls: 'km-ks-feat-head' });
      head.createEl('strong', { text: feat.name });
      head.createSpan({ cls: 'km-ks-feat-tag', text: FEAT_TYPE_LABELS[feat.type] });
      head.createSpan({ cls: 'km-ks-feat-lvl', text: `Lvl ${feat.level}` });
      item.createDiv({ cls: 'km-ks-feat-desc', text: feat.description });
    }
  }

  // =============================================================
  // Armies summary (compact; full editor lives in `kingdom-armies` codeblock)
  // =============================================================
  private renderArmiesSummary() {
    const k = this.opts.kingdom;
    const summary = computeArmyRosterSummary(k);
    const sec = this.section('km-ks-armies-summary', 'Armies');

    if (summary.total === 0) {
      sec.createEl('p', {
        cls: 'km-ks-note',
        text: 'No armies in this kingdom yet. Add a `kingdom-armies` codeblock and click Recruit, or use the Recruit Army activity.',
      });
      return;
    }

    // Compact stat boxes: total + per-status counts (skip statuses with 0)
    const stats = sec.createDiv({ cls: 'km-ks-armies-stats' });
    this.statBox(stats, 'Total', `${summary.total}`);
    for (const status of ['mobilized', 'garrisoned', 'recovering', 'defeated'] as const) {
      const n = summary.byStatus[status];
      if (n > 0) {
        const labels = { mobilized: 'Mobilised', garrisoned: 'Garrisoned', recovering: 'Recovering', defeated: 'Defeated' };
        this.statBox(stats, labels[status], `${n}`);
      }
    }
    this.statBox(stats, 'Consumption', `${summary.consumption}`);

    // Inline list of armies (name + status + level)
    const list = sec.createDiv({ cls: 'km-ks-armies-list' });
    for (const army of summary.armies) {
      if (army.status === 'disbanded') continue;
      const item = list.createDiv({ cls: `km-ks-army-row km-ks-army-status-${army.status}` });
      const left = item.createDiv({ cls: 'km-ks-army-row-left' });
      left.createEl('strong', { text: army.name });
      left.createSpan({ cls: 'km-ks-army-row-meta', text: ` Lvl ${army.level} ${army.type}` });
      const right = item.createDiv({ cls: 'km-ks-army-row-right' });
      const hpRatio = army.maxHp > 0 ? army.hp / army.maxHp : 0;
      const hpClass = hpRatio < 0.34 ? 'km-ks-hp-low' : hpRatio < 0.67 ? 'km-ks-hp-mid' : 'km-ks-hp-ok';
      right.createSpan({ cls: `km-ks-army-hp ${hpClass}`, text: `${army.hp}/${army.maxHp} HP` });
      const labels = { mobilized: 'Mobilised', garrisoned: 'Garrisoned', recovering: 'Recovering', defeated: 'Defeated', disbanded: 'Disbanded' };
      right.createSpan({ cls: 'km-ks-army-status-tag', text: labels[army.status] });
    }

    // Warnings
    if (summary.warnings.length > 0) {
      const warnBox = sec.createDiv({ cls: 'km-ks-armies-warnings' });
      const ul = warnBox.createEl('ul');
      for (const w of summary.warnings) ul.createEl('li', { text: w });
    }

    // Hint to open the full roster
    sec.createEl('p', {
      cls: 'km-ks-note',
      text: 'Edit the full roster (stats, conditions, tactics, gear) in a `kingdom-armies` codeblock.',
    });
  }

  // =============================================================
  // Active events summary (compact; full editor in `kingdom-events`)
  // =============================================================
  private renderActiveEventsSummary() {
    const k = this.opts.kingdom;
    const summary = computeEventSummary(k);
    if (summary.total === 0) return; // nothing to show

    const sec = this.section('km-ks-events-summary', 'Active events');

    if (summary.active.length === 0) {
      sec.createEl('p', {
        cls: 'km-ks-note',
        text: `No active events. ${summary.resolved.length} historical event${summary.resolved.length === 1 ? '' : 's'} in archive.`,
      });
      return;
    }

    // Stat boxes
    const stats = sec.createDiv({ cls: 'km-ks-events-stats' });
    this.statBox(stats, 'Active', `${summary.active.length}`);
    if (summary.continuousTicking > 0) {
      this.statBox(stats, 'Continuous', `${summary.continuousTicking}`);
    }

    // Per-event inline list
    const list = sec.createDiv({ cls: 'km-ks-events-list' });
    for (const inst of summary.active) {
      const item = list.createDiv({ cls: `km-ks-event-row km-ks-event-status-${inst.status}` });
      const left = item.createDiv({ cls: 'km-ks-event-row-left' });
      const entry = EVENT_BY_ID[inst.eventId];
      left.createEl('strong', { text: entry?.name ?? inst.eventId });
      left.createSpan({ cls: 'km-ks-event-row-meta', text: ` Turn ${inst.startTurn}` });
      const right = item.createDiv({ cls: 'km-ks-event-row-right' });
      if (inst.dcModifier > 0) {
        right.createSpan({ cls: 'km-ks-event-dcmod', text: `DC +${inst.dcModifier}` });
      }
      right.createSpan({ cls: 'km-ks-event-status-tag', text: inst.status });
    }

    // Warnings
    if (summary.warnings.length > 0) {
      const warnBox = sec.createDiv({ cls: 'km-ks-events-warnings' });
      const ul = warnBox.createEl('ul');
      for (const w of summary.warnings) ul.createEl('li', { text: w });
    }

    sec.createEl('p', {
      cls: 'km-ks-note',
      text: 'Resolve events in a `kingdom-events` codeblock; new events fire automatically each Event-phase rollover.',
    });
  }

  // =============================================================
  // Cross-settlement roll-up
  // =============================================================
  private renderRollup() {
    const k = this.opts.kingdom;
    const rollup = computeRollup(k, this.opts.allSettlements);
    const sec = this.section('km-ks-rollup', 'Kingdom-wide roll-up');

    if (rollup.settlements.length === 0) {
      sec.createEl('p', {
        cls: 'km-ks-note',
        text: 'No settlements registered to this kingdom yet. Add a `kingdom: ' + k.name + '` field to settlement codeblocks to wire them in.',
      });
      return;
    }

    // Top-level stats
    const stats = sec.createDiv({ cls: 'km-ks-rollup-stats' });
    this.statBox(stats, 'Settlements', `${rollup.settlements.length}`);
    this.statBox(stats, 'Capital', rollup.capitalName ?? '—');
    this.statBox(stats, 'Population', this.formatPop(rollup.totalPopulation));
    this.statBox(stats, 'Residential lots', `${rollup.totalResidentialLots}`);
    this.statBox(stats, 'Filled blocks', `${rollup.totalFilledBlocks}`);
    this.statBox(stats, 'Consumption', `${rollup.totalConsumption}`);

    // Consumption shortfall warning
    if (rollup.totalConsumption > k.stockpiles.food) {
      const warn = sec.createDiv({ cls: 'km-ks-warn-strong' });
      warn.setText(
        `⚠ Consumption (${rollup.totalConsumption}) exceeds stored Food (${k.stockpiles.food}). Shortfall = ${rollup.totalConsumption - k.stockpiles.food}; pay 5 RP per unit short or gain Unrest.`,
      );
    }

    // Best item levels by tradition
    const il = sec.createDiv({ cls: 'km-ks-rollup-itemlevels' });
    il.createEl('h4', { text: 'Best item availability across the kingdom' });
    const ilTbl = il.createEl('table', { cls: 'km-ks-il-table' });
    const ilHead = ilTbl.createEl('tr');
    ilHead.createEl('th', { text: 'Tradition' });
    ilHead.createEl('th', { text: 'Best level' });
    ilHead.createEl('th', { text: 'Where' });
    for (const trad of Object.keys(rollup.bestItemLevels) as Array<keyof typeof rollup.bestItemLevels>) {
      const data = rollup.bestItemLevels[trad];
      const tr = ilTbl.createEl('tr');
      tr.createEl('td', { text: ITEM_TRADITION_LABELS[trad] });
      tr.createEl('td', { text: `${data.level}` });
      tr.createEl('td', { text: data.settlementName ?? '—' });
    }

    // Activity bonus matrix
    if (rollup.activityBonuses.length > 0) {
      const ab = sec.createDiv({ cls: 'km-ks-rollup-activities' });
      ab.createEl('h4', { text: 'Best activity bonuses across the kingdom' });
      const tbl = ab.createEl('table', { cls: 'km-ks-act-table' });
      const head = tbl.createEl('tr');
      head.createEl('th', { text: 'Activity' });
      head.createEl('th', { text: 'Bonus' });
      head.createEl('th', { text: 'Where' });
      for (const e of rollup.activityBonuses) {
        const tr = tbl.createEl('tr');
        tr.createEl('td', { text: e.label });
        tr.createEl('td', { text: `+${e.bonus}` });
        tr.createEl('td', { text: e.settlementName });
      }
    }

    // Consolidated warnings
    if (rollup.warnings.length > 0) {
      const warnBox = sec.createDiv({ cls: 'km-ks-rollup-warnings' });
      warnBox.createEl('h4', { text: 'Settlement warnings' });
      const ul = warnBox.createEl('ul');
      for (const w of rollup.warnings) ul.createEl('li', { text: w });
    }
  }

  // =============================================================
  // 9. Settlement directory
  // =============================================================
  private renderSettlementDirectory() {
    const k = this.opts.kingdom;
    const myset = this.opts.allSettlements.filter(s => s.kingdomName === k.name);
    if (myset.length === 0) return;

    const sec = this.section('km-ks-directory', 'Settlements');
    const tbl = sec.createEl('table', { cls: 'km-ks-directory-table' });
    const head = tbl.createEl('tr');
    head.createEl('th', { text: 'Name' });
    head.createEl('th', { text: 'Type' });
    head.createEl('th', { text: 'Capital' });
    head.createEl('th', { text: 'Filled blocks' });
    head.createEl('th', { text: 'Pop.' });

    const rollup = computeRollup(k, this.opts.allSettlements);
    for (const { state, summary } of rollup.settlements) {
      const tr = tbl.createEl('tr');
      tr.createEl('td', { text: state.name });
      tr.createEl('td', { text: summary.type });
      tr.createEl('td', { text: state.isCapital ? '★' : '' });
      tr.createEl('td', { text: `${summary.filledBlocks} / 9` });
      tr.createEl('td', { text: this.formatPop(summary.population) });
    }
  }

  // =============================================================
  // 10. Event log
  // =============================================================
  private renderEventLog() {
    const k = this.opts.kingdom;
    const sec = this.section('km-ks-events', 'Event log');

    const addBtn = sec.createEl('button', { text: '+ Add event', cls: 'km-ks-add-event' });
    addBtn.addEventListener('click', async () => {
      const ev: KingdomEvent = {
        id: cryptoRandomId(),
        turn: k.turn.number,
        phase: k.turn.phase,
        title: 'New event',
        notes: '',
        expanded: true,
      };
      k.events.unshift(ev);
      await this.commit();
      this.render();
    });

    if (k.events.length === 0) {
      sec.createEl('p', { cls: 'km-ks-note', text: 'No events logged yet.' });
      return;
    }

    const list = sec.createDiv({ cls: 'km-ks-event-list' });
    for (const ev of k.events) {
      const item = list.createDiv({ cls: 'km-ks-event' });
      const head = item.createDiv({ cls: 'km-ks-event-head' });

      const titleInput = head.createEl('input', {
        type: 'text',
        cls: 'km-ks-event-title',
        attr: { value: ev.title },
      });
      titleInput.addEventListener('change', async () => {
        ev.title = titleInput.value;
        await this.commit();
      });

      head.createSpan({
        cls: 'km-ks-event-meta',
        text: `Turn ${ev.turn}${ev.phase ? ` · ${TURN_PHASE_LABELS[ev.phase]}` : ''}`,
      });

      const toggleBtn = head.createEl('button', { text: ev.expanded ? '▾' : '▸', cls: 'km-ks-event-toggle' });
      toggleBtn.addEventListener('click', async () => {
        ev.expanded = !ev.expanded;
        await this.commit();
        this.render();
      });

      const delBtn = head.createEl('button', { text: '×', cls: 'km-ks-event-del' });
      delBtn.addEventListener('click', async () => {
        k.events = k.events.filter(e => e.id !== ev.id);
        await this.commit();
        this.render();
      });

      if (ev.expanded) {
        const body = item.createDiv({ cls: 'km-ks-event-body' });
        const notesArea = body.createEl('textarea', { cls: 'km-ks-event-notes' });
        notesArea.value = ev.notes;
        notesArea.placeholder = 'What happened? Outcome? GM notes…';
        notesArea.addEventListener('change', async () => {
          ev.notes = notesArea.value;
          await this.commit();
        });
      }
    }
  }

  // =============================================================
  // 11. Notes
  // =============================================================
  private renderNotes() {
    const k = this.opts.kingdom;
    const sec = this.section('km-ks-notes', 'Notes');
    const ta = sec.createEl('textarea', { cls: 'km-ks-notes-area' });
    ta.value = k.notes;
    ta.placeholder = 'Free-form notes about this kingdom — history, NPCs, plot threads, anything…';
    ta.addEventListener('change', async () => {
      k.notes = ta.value;
      await this.commit();
    });
  }

  // =============================================================
  // =============================================================
  // Helpers
  // =============================================================
  private async commit() {
    await this.opts.onKingdomChange(this.opts.kingdom);
  }

  private section(cls: string, title: string): HTMLElement {
    const sec = this.rootEl.createDiv({ cls: `km-ks-section ${cls}` });
    sec.createEl('h3', { text: title });
    return sec;
  }

  private statBox(parent: HTMLElement, label: string, value: string, onEdit?: (cell: HTMLElement) => void) {
    const cell = parent.createDiv({ cls: 'km-ks-stat-box' });
    if (onEdit) {
      onEdit(cell);
    } else {
      cell.createDiv({ cls: 'km-ks-stat-value', text: value });
    }
    cell.createDiv({ cls: 'km-ks-stat-label', text: label });
  }

  private numberInputCallback(min: number, max: number, value: number, onChange: (v: number) => Promise<void>) {
    return (cell: HTMLElement) => {
      const wrap = cell.createDiv({ cls: 'km-ks-stat-value' });
      const input = wrap.createEl('input', {
        type: 'number',
        cls: 'km-ks-stat-input',
        attr: { min: `${min}`, max: `${max}`, value: `${value}` },
      });
      input.addEventListener('change', async () => {
        const v = Math.max(min, Math.min(max, parseInt(input.value, 10) || min));
        await onChange(v);
      });
    };
  }

  private textField(parent: HTMLElement, label: string, value: string, onChange: (v: string) => Promise<void>) {
    const row = parent.createDiv({ cls: 'km-ks-field' });
    row.createEl('label', { text: label });
    const input = row.createEl('input', { type: 'text', attr: { value } });
    input.addEventListener('change', async () => {
      await onChange(input.value);
    });
  }

  private selectField<T extends string>(
    parent: HTMLElement,
    label: string,
    value: T,
    options: Record<string, string>,
    onChange: (v: T) => Promise<void>,
  ) {
    const row = parent.createDiv({ cls: 'km-ks-field' });
    row.createEl('label', { text: label });
    const sel = row.createEl('select');
    for (const [k, v] of Object.entries(options)) {
      const opt = sel.createEl('option', { value: k, text: v });
      if (k === value) opt.selected = true;
    }
    sel.addEventListener('change', async () => {
      await onChange(sel.value as T);
    });
  }

  private formatPop(p: { min: number; max: number }): string {
    if (p.min === 0 && p.max === 0) return '0';
    if (p.min === p.max) return `${p.min.toLocaleString()}`;
    return `${p.min.toLocaleString()}–${p.max.toLocaleString()}`;
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as Crypto).randomUUID();
  return 'e_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
