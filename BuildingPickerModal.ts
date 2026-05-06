// =============================================================
// KingdomTurnView — per-turn activity workflow
// =============================================================
// Layout:
//   1. Turn header (turn number, current phase pills, advance button)
//   2. Phase summary (slot counts, ruin penalty, current resources)
//   3. Activity list filtered by current phase, grouped by leader role
//   4. Attempt dialog (half-auto rolling: roll → confirm/edit → apply)
//   5. Turn history (this turn's resolved attempts)
//
// Each activity card shows: name, role required (with leader's name), skill
// + DC + modifier breakdown, item bonuses from buildings, prereqs (greyed
// out if not met), and an Attempt button.

import { App, Notice } from 'obsidian';
import {
  applyAttempt,
  computeActivityCheck,
  computeEventSummary,
  controlDC,
  legalActivitiesFor,
  leadershipActivitySlots,
  nextTurnPhase,
  rollActivity,
  ruinTotalPenalty,
  tickContinuousEvents,
  triggerEventInstance,
  type LegalActivityInfo,
} from './kingdom';
import { ACTIVITY_BY_ID, type ActivityEntry, type OutcomeDelta } from './activities';
import { EVENT_BY_ID } from './events';
import {
  KINGDOM_ABILITY_LABELS,
  LEADERSHIP_ROLE_LABELS,
  OUTCOME_TIER_LABELS,
  TURN_PHASE_LABELS,
  TURN_PHASE_ORDER,
  type ActivityAttempt,
  type KingdomState,
  type LeadershipRole,
  type OutcomeTier,
  type SettlementState,
  type TurnPhase,
} from './types';

export interface KingdomTurnOptions {
  kingdom: KingdomState;
  /** All settlements in the vault — view filters internally by kingdomName. */
  allSettlements: Record<string, SettlementState>;
  onKingdomChange: (next: KingdomState) => Promise<void>;
}

export class KingdomTurnView {
  private app: App;
  private rootEl: HTMLElement;
  private opts: KingdomTurnOptions;
  /** Active attempt being reviewed in the dialog (null = no dialog open). */
  private pendingAttempt: ActivityAttempt | null = null;
  private pendingEntry: ActivityEntry | null = null;

  constructor(app: App, rootEl: HTMLElement, opts: KingdomTurnOptions) {
    this.app = app;
    this.rootEl = rootEl;
    this.opts = opts;
  }

  render() {
    this.rootEl.empty();
    this.rootEl.addClass('km-turn-root');

    this.renderHeader();
    this.renderPhaseSummary();
    if (this.opts.kingdom.turn.phase === 'event') this.renderEventPhasePanel();
    if (this.opts.kingdom.turn.phase === 'upkeep') this.renderUpkeepPanel();
    if (this.pendingAttempt && this.pendingEntry) this.renderAttemptDialog();
    this.renderActivityList();
    this.renderTurnHistory();
  }

  // ===========================================================
  // 1. Header
  // ===========================================================
  private renderHeader() {
    const k = this.opts.kingdom;
    const head = this.rootEl.createDiv({ cls: 'km-turn-header' });
    head.createEl('h3', { text: `${k.name} — Turn ${k.turn.number}` });

    const phaseBar = this.rootEl.createDiv({ cls: 'km-turn-phasebar' });
    for (const ph of TURN_PHASE_ORDER) {
      const pill = phaseBar.createEl('button', {
        text: TURN_PHASE_LABELS[ph],
        cls: 'km-turn-phasepill',
      });
      if (ph === k.turn.phase) pill.addClass('is-active');
      pill.addEventListener('click', async () => {
        k.turn.phase = ph;
        await this.commit();
        this.render();
      });
    }

    const actions = this.rootEl.createDiv({ cls: 'km-turn-actions' });
    const advBtn = actions.createEl('button', { text: 'Advance phase →', cls: 'mod-cta' });
    advBtn.addEventListener('click', async () => {
      const next = nextTurnPhase(k.turn.phase);
      k.turn.phase = next.phase;
      if (next.advancesTurn) {
        k.turn.number += 1;
        k.turn.leadershipActivitiesUsed = 0;
        k.turn.perLeaderUsed = {};
        k.turn.attempts = []; // clear attempts on new turn
        new Notice(`Advanced to Turn ${k.turn.number}, ${TURN_PHASE_LABELS[next.phase]} phase.`);
      } else {
        // Reset per-leader phase slots when entering a new phase that uses them.
        if (next.phase === 'commerce' || next.phase === 'civic') {
          k.turn.perLeaderUsed = {};
        }
        new Notice(`Phase: ${TURN_PHASE_LABELS[next.phase]}`);
      }
      await this.commit();
      this.render();
    });
  }

  // ===========================================================
  // 2. Phase summary
  // ===========================================================
  private renderPhaseSummary() {
    const k = this.opts.kingdom;
    const myset = Object.values(this.opts.allSettlements).filter(s => s.kingdomName === k.name);
    const slots = leadershipActivitySlots(k, myset);
    const dc = controlDC(k);
    const rp = ruinTotalPenalty(k);

    const summary = this.rootEl.createDiv({ cls: 'km-turn-summary' });
    this.statBox(summary, 'Phase', TURN_PHASE_LABELS[k.turn.phase]);
    if (k.turn.phase === 'leadership') {
      const usedColour = k.turn.leadershipActivitiesUsed >= slots ? 'km-turn-stat-warn' : '';
      this.statBox(summary, 'Leadership slots', `${k.turn.leadershipActivitiesUsed} / ${slots}`, usedColour);
    }
    this.statBox(summary, 'Control DC', `${dc}`);
    this.statBox(summary, 'Ruin penalty', rp > 0 ? `−${rp}` : '0', rp > 0 ? 'km-turn-stat-warn' : '');
    this.statBox(summary, 'RP', `${k.stockpiles.rp}`);
    this.statBox(summary, 'Food', `${k.stockpiles.food}`);
    this.statBox(summary, 'Unrest', `${k.unrest}`, k.unrest > 0 ? 'km-turn-stat-warn' : '');
    this.statBox(summary, 'Fame', `${k.fame}`);
  }

  // ===========================================================
  // Event phase panel
  // ===========================================================
  // Shown only when the current phase is 'event'. Provides a button to roll
  // a new kingdom event (which adds it to kingdom.eventInstances), plus a
  // summary of currently-active events.
  private renderEventPhasePanel() {
    const k = this.opts.kingdom;
    const summary = computeEventSummary(k);
    const sec = this.rootEl.createDiv({ cls: 'km-turn-section km-turn-event-phase' });
    sec.createEl('h4', { text: 'Event phase' });

    const intro = sec.createDiv({ cls: 'km-turn-event-intro' });
    intro.createSpan({
      text: 'Roll a new event from the kingdom event table, then resolve it (and any active continuous events) in the events block.',
    });

    const actions = sec.createDiv({ cls: 'km-turn-event-actions' });
    const rollBtn = actions.createEl('button', { text: 'Roll new event', cls: 'mod-cta' });
    rollBtn.addEventListener('click', async () => {
      const inst = triggerEventInstance(k);
      const entry = EVENT_BY_ID[inst.eventId];
      await this.commit();
      this.render();
      new Notice(`Event rolled: ${entry?.name ?? inst.eventId}. Resolve in your kingdom-events block.`);
    });

    if (summary.active.length > 0) {
      const activeList = sec.createDiv({ cls: 'km-turn-event-active-list' });
      activeList.createEl('h5', { text: `${summary.active.length} active event${summary.active.length === 1 ? '' : 's'} need attention` });
      const ul = activeList.createEl('ul');
      for (const inst of summary.active) {
        const entry = EVENT_BY_ID[inst.eventId];
        const li = ul.createEl('li');
        li.createEl('strong', { text: entry?.name ?? inst.eventId });
        li.appendText(` — Turn ${inst.startTurn}, ${inst.status}`);
        if (inst.dcModifier > 0) li.appendText(` (DC +${inst.dcModifier})`);
      }
    } else {
      sec.createEl('p', {
        cls: 'km-turn-note',
        text: 'No active events. Roll above to draw a new one.',
      });
    }
  }

  // ===========================================================
  // Upkeep phase panel
  // ===========================================================
  // Shown only when the current phase is 'upkeep'. Provides a "Tick continuous
  // events" button that applies each active continuous event's per-turn
  // upkeep effect to the kingdom.
  private renderUpkeepPanel() {
    const k = this.opts.kingdom;
    const summary = computeEventSummary(k);
    if (summary.continuousTicking === 0) return; // nothing to show

    const sec = this.rootEl.createDiv({ cls: 'km-turn-section km-turn-upkeep' });
    sec.createEl('h4', { text: 'Continuous events' });

    sec.createEl('p', {
      cls: 'km-turn-note',
      text: `${summary.continuousTicking} continuous event${summary.continuousTicking === 1 ? '' : 's'} will tick this Upkeep. Each applies its per-turn effect to your kingdom.`,
    });

    const list = sec.createDiv({ cls: 'km-turn-upkeep-list' });
    for (const inst of summary.active) {
      const entry = EVENT_BY_ID[inst.eventId];
      if (!entry || entry.kind !== 'continuous' || !entry.upkeepEffect) continue;
      const item = list.createDiv({ cls: 'km-turn-upkeep-item' });
      item.createEl('strong', { text: entry.name });
      item.createSpan({ cls: 'km-turn-upkeep-effect', text: ` — ${entry.upkeepEffect.text ?? 'Continuous effect.'}` });
    }

    const actions = sec.createDiv({ cls: 'km-turn-upkeep-actions' });
    const tickBtn = actions.createEl('button', { text: 'Apply tick effects', cls: 'mod-cta' });
    tickBtn.addEventListener('click', async () => {
      const tickSummary = tickContinuousEvents(k);
      await this.commit();
      this.render();
      new Notice(`Applied ${tickSummary.length} continuous event tick${tickSummary.length === 1 ? '' : 's'}.`);
    });
  }

  // ===========================================================
  // Activity list
  // ===========================================================
  private renderActivityList() {
    const k = this.opts.kingdom;
    const myset = Object.values(this.opts.allSettlements).filter(s => s.kingdomName === k.name);
    const legal = legalActivitiesFor(k, myset, k.turn.phase);

    const sec = this.rootEl.createDiv({ cls: 'km-turn-section km-turn-activities' });
    sec.createEl('h4', { text: `${TURN_PHASE_LABELS[k.turn.phase]} activities` });

    if (legal.length === 0) {
      sec.createEl('p', {
        cls: 'km-turn-note',
        text: `No catalogued activities for the ${TURN_PHASE_LABELS[k.turn.phase]} phase yet. Resolve manually and log to the kingdom sheet's event log.`,
      });
      return;
    }

    // Group by role (or "Any" for unroled activities)
    const byRole = new Map<string, LegalActivityInfo[]>();
    for (const info of legal) {
      const key = info.entry.role ?? '_any';
      if (!byRole.has(key)) byRole.set(key, []);
      byRole.get(key)!.push(info);
    }

    const grid = sec.createDiv({ cls: 'km-turn-activity-grid' });
    // Render groups in a reasonable order: any-role first, then by role label
    const orderedKeys = Array.from(byRole.keys()).sort((a, b) => {
      if (a === '_any') return -1;
      if (b === '_any') return 1;
      return LEADERSHIP_ROLE_LABELS[a as LeadershipRole].localeCompare(LEADERSHIP_ROLE_LABELS[b as LeadershipRole]);
    });

    for (const key of orderedKeys) {
      const group = byRole.get(key)!;
      const groupEl = grid.createDiv({ cls: 'km-turn-activity-group' });
      const groupTitle = groupEl.createEl('h5', { cls: 'km-turn-group-title' });
      if (key === '_any') {
        groupTitle.setText('Any leader');
      } else {
        const role = key as LeadershipRole;
        const slot = k.leadership.find(l => l.role === role);
        const leaderName = slot?.name?.trim() || 'Vacant';
        const investedLabel = slot?.invested ? '' : ' (uninvested)';
        groupTitle.setText(`${LEADERSHIP_ROLE_LABELS[role]} — ${leaderName}${investedLabel}`);
        if (!slot?.name?.trim()) groupTitle.addClass('km-turn-group-vacant');
      }
      for (const info of group) {
        groupEl.appendChild(this.renderActivityCard(info));
      }
    }
  }

  private renderActivityCard(info: LegalActivityInfo): HTMLElement {
    const k = this.opts.kingdom;
    const myset = Object.values(this.opts.allSettlements).filter(s => s.kingdomName === k.name);
    const card = document.createElement('div');
    card.className = 'km-turn-activity-card' + (info.legal ? '' : ' is-blocked');

    const head = card.createDiv({ cls: 'km-turn-card-head' });
    head.createEl('strong', { text: info.entry.name });

    const meta = card.createDiv({ cls: 'km-turn-card-meta' });
    meta.createSpan({
      text: `${KINGDOM_ABILITY_LABELS[info.entry.skill]}`,
      cls: 'km-turn-card-skill',
    });

    // Compute and show the check details
    const check = computeActivityCheck(k, myset, info.entry);
    const checkEl = card.createDiv({ cls: 'km-turn-card-check' });
    const modSign = check.modifier >= 0 ? '+' : '';
    checkEl.createSpan({ text: `${modSign}${check.modifier}`, cls: 'km-turn-card-mod' });
    checkEl.appendText(' vs ');
    checkEl.createSpan({ text: `DC ${check.dc}`, cls: 'km-turn-card-dc' });
    checkEl.setAttr('title', check.breakdown.map(b => `${b.label}: ${b.value >= 0 ? '+' : ''}${b.value}`).join('\n'));

    if (check.itemBonus > 0) {
      const ib = card.createDiv({ cls: 'km-turn-card-itembonus' });
      ib.setText(`+${check.itemBonus} item from ${check.itemBonusSources.join(', ')}`);
    }

    card.createDiv({ cls: 'km-turn-card-desc', text: info.entry.description });

    // Prereq warnings
    if (info.blockedReasons.length > 0) {
      const warn = card.createDiv({ cls: 'km-turn-card-warn' });
      for (const r of info.blockedReasons) warn.createEl('div', { text: r });
    }

    const actions = card.createDiv({ cls: 'km-turn-card-actions' });
    const attemptBtn = actions.createEl('button', { text: 'Attempt', cls: 'mod-cta' });
    if (!info.legal) attemptBtn.disabled = true;
    attemptBtn.addEventListener('click', () => this.openAttempt(info.entry));

    return card;
  }

  // ===========================================================
  // 4. Attempt dialog
  // ===========================================================
  private openAttempt(entry: ActivityEntry) {
    const k = this.opts.kingdom;
    const myset = Object.values(this.opts.allSettlements).filter(s => s.kingdomName === k.name);
    this.pendingAttempt = rollActivity(k, myset, entry);
    this.pendingEntry = entry;
    this.render();
    // Scroll to dialog
    this.rootEl.querySelector('.km-turn-attempt-dialog')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private renderAttemptDialog() {
    if (!this.pendingAttempt || !this.pendingEntry) return;
    const k = this.opts.kingdom;
    const attempt = this.pendingAttempt;
    const entry = this.pendingEntry;

    const dlg = this.rootEl.createDiv({ cls: 'km-turn-attempt-dialog' });
    const head = dlg.createDiv({ cls: 'km-turn-attempt-head' });
    head.createEl('h4', { text: `Attempting: ${entry.name}` });
    const closeBtn = head.createEl('button', { text: '×', cls: 'km-turn-attempt-close' });
    closeBtn.addEventListener('click', () => {
      this.pendingAttempt = null;
      this.pendingEntry = null;
      this.render();
    });

    // Roll display
    const rollBox = dlg.createDiv({ cls: 'km-turn-rollbox' });
    rollBox.createEl('div', { cls: 'km-turn-roll-line', text: `d20 = ${attempt.d20}, modifier ${attempt.modifier >= 0 ? '+' : ''}${attempt.modifier}, total ${attempt.total} vs DC ${attempt.dc}` });

    const tierLabel = OUTCOME_TIER_LABELS[attempt.outcome];
    const tierEl = rollBox.createEl('div', { cls: `km-turn-tier km-turn-tier-${attempt.outcome}` });
    tierEl.setText(tierLabel + (attempt.overridden ? ' (overridden)' : ''));

    // Outcome description
    if (entry.outcomes) {
      const desc = entry.outcomes[attempt.outcome];
      if (desc.text) {
        dlg.createDiv({ cls: 'km-turn-outcome-text', text: desc.text });
      }
      const numeric = formatDelta(desc);
      if (numeric) {
        dlg.createDiv({ cls: 'km-turn-outcome-deltas', text: `Effect: ${numeric}` });
      }
    }

    // Override controls
    const ovr = dlg.createDiv({ cls: 'km-turn-override' });
    ovr.createEl('label', { text: 'Override outcome:' });
    const sel = ovr.createEl('select');
    for (const t of ['critical-success', 'success', 'failure', 'critical-failure'] as OutcomeTier[]) {
      const opt = sel.createEl('option', { value: t, text: OUTCOME_TIER_LABELS[t] });
      if (t === attempt.outcome) opt.selected = true;
    }
    sel.addEventListener('change', () => {
      const newTier = sel.value as OutcomeTier;
      if (newTier !== attempt.outcome) {
        attempt.outcome = newTier;
        attempt.overridden = true;
        this.render();
      }
    });

    // Notes
    const notesRow = dlg.createDiv({ cls: 'km-turn-attempt-notes' });
    notesRow.createEl('label', { text: 'GM notes (optional):' });
    const ta = notesRow.createEl('textarea');
    ta.value = attempt.notes ?? '';
    ta.placeholder = 'Adjudications, partial-credit calls, follow-ups…';
    ta.addEventListener('change', () => {
      attempt.notes = ta.value || undefined;
    });

    // Reroll + Apply + Cancel
    const actions = dlg.createDiv({ cls: 'km-turn-attempt-actions' });
    const rerollBtn = actions.createEl('button', { text: 'Reroll' });
    rerollBtn.addEventListener('click', () => {
      const myset = Object.values(this.opts.allSettlements).filter(s => s.kingdomName === k.name);
      this.pendingAttempt = rollActivity(k, myset, entry);
      this.render();
    });

    const applyBtn = actions.createEl('button', { text: 'Apply outcome', cls: 'mod-cta' });
    applyBtn.addEventListener('click', async () => {
      // Read the latest notes value (in case the change event hasn't fired yet)
      attempt.notes = ta.value || undefined;
      applyAttempt(k, attempt);
      this.pendingAttempt = null;
      this.pendingEntry = null;
      await this.commit();
      this.render();
      new Notice(`${entry.name}: ${OUTCOME_TIER_LABELS[attempt.outcome]} applied.`);
    });

    const cancelBtn = actions.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.pendingAttempt = null;
      this.pendingEntry = null;
      this.render();
    });
  }

  // ===========================================================
  // 5. Turn history
  // ===========================================================
  private renderTurnHistory() {
    const k = this.opts.kingdom;
    const attempts = k.turn.attempts ?? [];
    if (attempts.length === 0) return;
    const sec = this.rootEl.createDiv({ cls: 'km-turn-section km-turn-history' });
    sec.createEl('h4', { text: 'Resolved this turn' });
    const list = sec.createDiv({ cls: 'km-turn-history-list' });
    for (const a of [...attempts].reverse()) {
      const entry = ACTIVITY_BY_ID[a.activityId];
      const item = list.createDiv({ cls: 'km-turn-history-item' });
      const head = item.createDiv({ cls: 'km-turn-history-head' });
      head.createEl('strong', { text: entry?.name ?? a.activityId });
      head.createSpan({
        cls: `km-turn-tier km-turn-tier-${a.outcome}`,
        text: OUTCOME_TIER_LABELS[a.outcome] + (a.overridden ? ' (overridden)' : ''),
      });
      head.createSpan({
        cls: 'km-turn-history-roll',
        text: `${a.d20}+${a.modifier}=${a.total} vs DC ${a.dc}`,
      });
      if (a.notes) {
        item.createDiv({ cls: 'km-turn-history-notes', text: a.notes });
      }
    }
  }

  // ===========================================================
  // Helpers
  // ===========================================================
  private statBox(parent: HTMLElement, label: string, value: string, extraCls = '') {
    const cell = parent.createDiv({ cls: `km-turn-statbox ${extraCls}` });
    cell.createDiv({ cls: 'km-turn-statvalue', text: value });
    cell.createDiv({ cls: 'km-turn-statlabel', text: label });
  }

  private async commit() {
    await this.opts.onKingdomChange(this.opts.kingdom);
  }
}

// ===========================================================
// Helpers (top-level)
// ===========================================================
function formatDelta(d: OutcomeDelta): string {
  const parts: string[] = [];
  const num = (label: string, v: number | undefined, sign = true) => {
    if (!v) return;
    parts.push(`${sign && v > 0 ? '+' : ''}${v} ${label}`);
  };
  num('RP', d.rp);
  num('Food', d.food);
  num('Lumber', d.lumber);
  num('Luxuries', d.luxuries);
  num('Ore', d.ore);
  num('Stone', d.stone);
  num('Unrest', d.unrest);
  num('Fame', d.fame);
  num('XP', d.xp);
  num('Corruption', d.corruption);
  num('Crime', d.crime);
  num('Decay', d.decay);
  num('Strife', d.strife);
  return parts.join(', ');
}
