// =============================================================
// KingdomEventsView — event roster and resolution
// =============================================================
// Layout:
//   1. Header (kingdom name + active count + next-tick summary)
//   2. Toolbar (roll new event, status filter)
//   3. Active events: one card per event with:
//      - name, kind, status, started-on-turn
//      - description + rules text
//      - per-Upkeep effect (continuous events only)
//      - resolution dialog: pick skill, roll, confirm/edit outcome, apply
//      - attempts history
//      - dismiss/delete buttons
//   4. Resolved/historical events: collapsible list
//
// Half-auto rolling matches the kingdom-turn workflow: plugin rolls + classifies,
// GM confirms / overrides / applies.

import { App, Notice } from 'obsidian';
import {
  applyEventResolution,
  attemptEventResolution,
  computeEventSummary,
  deleteEventInstance,
  dismissEventInstance,
  triggerEventInstance,
} from './kingdom';
import {
  EVENTS,
  EVENT_BY_ID,
  EVENT_KIND_LABELS,
  EVENT_STATUS_LABELS,
  type EventInstance,
  type ResolutionAttempt,
  type EventStatus,
} from './events';
import {
  KINGDOM_ABILITY_LABELS,
  OUTCOME_TIER_LABELS,
  type KingdomAbility,
  type KingdomState,
  type OutcomeTier,
  type SettlementState,
} from './types';

export interface KingdomEventsOptions {
  kingdom: KingdomState;
  /** Used only by the event engine (passes through to kingdom commits). */
  allSettlements: Record<string, SettlementState>;
  onKingdomChange: (next: KingdomState) => Promise<void>;
}

const ALL_STATUSES: EventStatus[] = ['active', 'worsened', 'resolved', 'failed', 'dismissed'];
const DEFAULT_STATUSES: EventStatus[] = ['active', 'worsened'];

export class KingdomEventsView {
  private app: App;
  private rootEl: HTMLElement;
  private opts: KingdomEventsOptions;
  /** Per-instance pending resolution (one open at a time per event). */
  private pendingResolutions: Map<string, ResolutionAttempt> = new Map();
  /** Status filter — by default only show active + worsened. */
  private statusFilter: Set<EventStatus> = new Set(DEFAULT_STATUSES);
  /** Whether the historical/resolved section is expanded. */
  private historyExpanded = false;

  constructor(app: App, rootEl: HTMLElement, opts: KingdomEventsOptions) {
    this.app = app;
    this.rootEl = rootEl;
    this.opts = opts;
  }

  render() {
    this.rootEl.empty();
    this.rootEl.addClass('km-event-root');

    this.renderHeader();
    this.renderToolbar();
    this.renderEventsList();
  }

  // ===========================================================
  // Header
  // ===========================================================
  private renderHeader() {
    const k = this.opts.kingdom;
    const summary = computeEventSummary(k);
    const head = this.rootEl.createDiv({ cls: 'km-event-header' });
    head.createEl('h3', { text: `${k.name} — Events` });
    const stats = head.createDiv({ cls: 'km-event-headerstats' });
    const parts: string[] = [];
    parts.push(`${summary.active.length} active`);
    if (summary.continuousTicking > 0) {
      parts.push(`${summary.continuousTicking} ticking each Upkeep`);
    }
    if (summary.resolved.length > 0) {
      parts.push(`${summary.resolved.length} historical`);
    }
    stats.createSpan({ text: parts.join(' · ') });

    if (summary.warnings.length > 0) {
      const warnBox = this.rootEl.createDiv({ cls: 'km-event-warnings' });
      warnBox.createEl('h5', { text: 'Worsened events' });
      const ul = warnBox.createEl('ul');
      for (const w of summary.warnings) ul.createEl('li', { text: w });
    }
  }

  // ===========================================================
  // Toolbar
  // ===========================================================
  private renderToolbar() {
    const k = this.opts.kingdom;
    const bar = this.rootEl.createDiv({ cls: 'km-event-toolbar' });

    const rollBtn = bar.createEl('button', { text: 'Roll new event', cls: 'mod-cta' });
    rollBtn.setAttr('title', 'Rolls on the kingdom event table; the result is added to the active list.');
    rollBtn.addEventListener('click', async () => {
      const inst = triggerEventInstance(k);
      const entry = EVENT_BY_ID[inst.eventId];
      await this.commit();
      this.render();
      this.rootEl.querySelector(`[data-instance-id="${inst.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      new Notice(`Event rolled: ${entry?.name ?? inst.eventId}.`);
    });

    // Pick a specific event to add (useful for GMs running scripted events)
    const pickerWrap = bar.createDiv({ cls: 'km-event-picker' });
    pickerWrap.createSpan({ cls: 'km-event-picker-label', text: 'or add specific:' });
    const picker = pickerWrap.createEl('select');
    picker.createEl('option', { value: '', text: '— Choose event —' });
    const sortedEvents = [...EVENTS].sort((a, b) => a.name.localeCompare(b.name));
    for (const e of sortedEvents) {
      const opt = picker.createEl('option', { value: e.id, text: `${e.name} (${EVENT_KIND_LABELS[e.kind]})` });
      opt.setAttr('title', e.description);
    }
    picker.addEventListener('change', async () => {
      if (!picker.value) return;
      const inst = triggerEventInstance(k, picker.value);
      const entry = EVENT_BY_ID[inst.eventId];
      picker.value = '';
      await this.commit();
      this.render();
      new Notice(`Added event: ${entry?.name}.`);
    });

    // Status filter chips
    const filterBox = bar.createDiv({ cls: 'km-event-filter' });
    filterBox.createSpan({ cls: 'km-event-filter-label', text: 'Show:' });
    for (const s of ALL_STATUSES) {
      const chip = filterBox.createEl('button', {
        text: EVENT_STATUS_LABELS[s],
        cls: 'km-event-filter-chip',
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
  // Events list
  // ===========================================================
  private renderEventsList() {
    const k = this.opts.kingdom;
    const all = Object.values(k.eventInstances);
    if (all.length === 0) {
      const empty = this.rootEl.createDiv({ cls: 'km-event-empty' });
      empty.createEl('p', { text: 'No events have been rolled yet. Click "Roll new event" above to roll on the kingdom event table.' });
      return;
    }
    const visible = all
      .filter(i => this.statusFilter.has(i.status))
      .sort((a, b) => {
        // Active/worsened first, then by start turn descending
        const aActive = a.status === 'active' || a.status === 'worsened';
        const bActive = b.status === 'active' || b.status === 'worsened';
        if (aActive !== bActive) return aActive ? -1 : 1;
        return b.startTurn - a.startTurn;
      });
    if (visible.length === 0) {
      const empty = this.rootEl.createDiv({ cls: 'km-event-empty' });
      empty.createEl('p', { text: 'No events match the current filter.' });
      return;
    }

    const grid = this.rootEl.createDiv({ cls: 'km-event-grid' });
    for (const inst of visible) {
      grid.appendChild(this.renderEventCard(inst));
    }
  }

  private renderEventCard(inst: EventInstance): HTMLElement {
    const k = this.opts.kingdom;
    const entry = EVENT_BY_ID[inst.eventId];
    const card = document.createElement('div');
    card.className = `km-event-card km-event-status-${inst.status} km-event-kind-${entry?.kind ?? 'oneshot'}`;
    card.setAttr('data-instance-id', inst.id);

    if (!entry) {
      card.createDiv({ cls: 'km-event-card-head', text: `Unknown event: ${inst.eventId}` });
      return card;
    }

    // ---- Head: name, kind tag, status tag, turn started ----
    const head = card.createDiv({ cls: 'km-event-card-head' });
    const nameWrap = head.createDiv({ cls: 'km-event-card-name' });
    nameWrap.createEl('strong', { text: entry.name });
    nameWrap.createSpan({ cls: 'km-event-card-kind', text: EVENT_KIND_LABELS[entry.kind] });
    const statusWrap = head.createDiv({ cls: 'km-event-card-statuswrap' });
    statusWrap.createSpan({ cls: `km-event-card-status km-event-status-${inst.status}`, text: EVENT_STATUS_LABELS[inst.status] });
    statusWrap.createSpan({ cls: 'km-event-card-turn', text: `Turn ${inst.startTurn}` });

    // ---- Description + rules ----
    card.createDiv({ cls: 'km-event-card-desc', text: entry.description });
    if (entry.rulesText) {
      card.createDiv({ cls: 'km-event-card-rules', text: entry.rulesText });
    }

    // ---- Per-upkeep effect ticker (continuous events) ----
    if (entry.upkeepEffect && (inst.status === 'active' || inst.status === 'worsened')) {
      const tick = card.createDiv({ cls: 'km-event-card-tick' });
      tick.createEl('strong', { text: 'Each Upkeep: ' });
      tick.appendText(entry.upkeepEffect.text ?? formatDelta(entry.upkeepEffect));
    }

    // ---- DC modifier indicator (worsened events) ----
    if (inst.dcModifier > 0) {
      card.createDiv({
        cls: 'km-event-card-dcmod',
        text: `Resolution DC is +${inst.dcModifier} (event has worsened ${inst.dcModifier / 2}× through critical failures).`,
      });
    }

    // ---- Resolution dialog ----
    if (inst.status === 'active' || inst.status === 'worsened') {
      this.renderResolutionDialog(card, inst, entry);
    }

    // ---- Attempts history ----
    if (inst.attempts.length > 0) {
      const histWrap = card.createDiv({ cls: 'km-event-card-attempts' });
      histWrap.createEl('h6', { text: 'Resolution attempts' });
      for (const a of [...inst.attempts].reverse()) {
        const attemptItem = histWrap.createDiv({ cls: 'km-event-attempt-item' });
        const tierClass = `km-event-tier-${a.outcome}`;
        const item = attemptItem.createDiv({ cls: 'km-event-attempt-line' });
        item.createSpan({ text: `T${a.turn} · ${KINGDOM_ABILITY_LABELS[a.skill]}: ` });
        item.createSpan({ text: `${a.d20}+${a.modifier}=${a.total} vs DC ${a.dc} → `, cls: 'km-event-attempt-roll' });
        item.createSpan({ text: OUTCOME_TIER_LABELS[a.outcome] + (a.overridden ? ' (overridden)' : ''), cls: `km-event-attempt-tier ${tierClass}` });
        if (a.notes) {
          attemptItem.createDiv({ cls: 'km-event-attempt-notes', text: a.notes });
        }
      }
    }

    // ---- Notes ----
    const notesRow = card.createDiv({ cls: 'km-event-card-notesrow' });
    notesRow.createEl('label', { text: 'Notes' });
    const notesTa = notesRow.createEl('textarea', { cls: 'km-event-card-notes' });
    notesTa.value = inst.notes ?? '';
    notesTa.placeholder = 'GM notes on this specific event instance…';
    notesTa.addEventListener('change', async () => {
      inst.notes = notesTa.value || undefined;
      await this.commit();
    });

    // ---- Action buttons ----
    const actions = card.createDiv({ cls: 'km-event-card-actions' });
    if (inst.status === 'active' || inst.status === 'worsened') {
      const dismissBtn = actions.createEl('button', { text: 'Dismiss', cls: 'mod-warning' });
      dismissBtn.setAttr('title', 'Mark this event as no longer being tracked. Use for events the GM has resolved off-screen.');
      dismissBtn.addEventListener('click', async () => {
        dismissEventInstance(k, inst.id);
        await this.commit();
        this.render();
        new Notice(`${entry.name} dismissed.`);
      });
    }
    const delBtn = actions.createEl('button', { text: 'Delete', cls: 'mod-danger' });
    delBtn.addEventListener('click', async () => {
      const confirmed = confirm(`Permanently delete this ${entry.name} event instance? This cannot be undone.`);
      if (!confirmed) return;
      deleteEventInstance(k, inst.id);
      this.pendingResolutions.delete(inst.id);
      await this.commit();
      this.render();
    });

    return card;
  }

  // ===========================================================
  // Per-event resolution dialog
  // ===========================================================
  private renderResolutionDialog(card: HTMLElement, inst: EventInstance, entry: typeof EVENTS[0]) {
    const k = this.opts.kingdom;
    const dlg = card.createDiv({ cls: 'km-event-resolve' });
    dlg.createEl('h6', { text: 'Attempt resolution' });

    const pending = this.pendingResolutions.get(inst.id);

    if (!pending) {
      // Skill picker + roll button
      const skillRow = dlg.createDiv({ cls: 'km-event-resolve-row' });
      skillRow.createEl('label', { text: 'Skill' });
      const skillSel = skillRow.createEl('select');
      const skills = entry.resolutionSkills.length > 0
        ? entry.resolutionSkills
        : (Object.keys(KINGDOM_ABILITY_LABELS) as KingdomAbility[]);
      for (const s of skills) {
        const opt = skillSel.createEl('option', { value: s, text: KINGDOM_ABILITY_LABELS[s] });
      }

      const rollBtn = dlg.createEl('button', { text: 'Roll resolution', cls: 'mod-cta' });
      rollBtn.addEventListener('click', () => {
        const skill = skillSel.value as KingdomAbility;
        const attempt = attemptEventResolution(k, inst, skill);
        this.pendingResolutions.set(inst.id, attempt);
        this.render();
      });
    } else {
      // Show roll result + confirm/edit/apply
      const tierLabel = OUTCOME_TIER_LABELS[pending.outcome];
      const roll = dlg.createDiv({ cls: 'km-event-rollresult' });
      roll.createEl('div', {
        cls: 'km-event-roll-line',
        text: `${KINGDOM_ABILITY_LABELS[pending.skill]}: d20 = ${pending.d20}, modifier ${pending.modifier >= 0 ? '+' : ''}${pending.modifier}, total ${pending.total} vs DC ${pending.dc}`,
      });
      const tierEl = roll.createEl('div', { cls: `km-event-tier km-event-tier-${pending.outcome}` });
      tierEl.setText(tierLabel + (pending.overridden ? ' (overridden)' : ''));

      // Outcome description from catalogue
      const delta = entry.outcomes?.[pending.outcome];
      if (delta?.text) {
        dlg.createDiv({ cls: 'km-event-outcome-text', text: delta.text });
      }
      if (delta) {
        const numeric = formatDelta(delta);
        if (numeric) dlg.createDiv({ cls: 'km-event-outcome-deltas', text: `Effect: ${numeric}` });
      }

      // Override
      const ovr = dlg.createDiv({ cls: 'km-event-override' });
      ovr.createEl('label', { text: 'Override outcome:' });
      const sel = ovr.createEl('select');
      for (const t of ['critical-success', 'success', 'failure', 'critical-failure'] as OutcomeTier[]) {
        const opt = sel.createEl('option', { value: t, text: OUTCOME_TIER_LABELS[t] });
        if (t === pending.outcome) opt.selected = true;
      }
      sel.addEventListener('change', () => {
        const newTier = sel.value as OutcomeTier;
        if (newTier !== pending.outcome) {
          pending.outcome = newTier;
          pending.overridden = true;
          this.render();
        }
      });

      // Notes
      const notesRow = dlg.createDiv({ cls: 'km-event-attempt-notesrow' });
      notesRow.createEl('label', { text: 'GM notes (optional):' });
      const ta = notesRow.createEl('textarea');
      ta.value = pending.notes ?? '';
      ta.placeholder = 'Adjudications, partial-credit calls…';
      ta.addEventListener('change', () => {
        pending.notes = ta.value || undefined;
      });

      // Action buttons
      const actions = dlg.createDiv({ cls: 'km-event-resolve-actions' });
      const rerollBtn = actions.createEl('button', { text: 'Reroll' });
      rerollBtn.addEventListener('click', () => {
        const re = attemptEventResolution(k, inst, pending.skill);
        this.pendingResolutions.set(inst.id, re);
        this.render();
      });
      const applyBtn = actions.createEl('button', { text: 'Apply outcome', cls: 'mod-cta' });
      applyBtn.addEventListener('click', async () => {
        pending.notes = ta.value || undefined;
        applyEventResolution(k, inst, pending);
        this.pendingResolutions.delete(inst.id);
        await this.commit();
        this.render();
        new Notice(`${entry.name}: ${OUTCOME_TIER_LABELS[pending.outcome]} applied.`);
      });
      const cancelBtn = actions.createEl('button', { text: 'Cancel' });
      cancelBtn.addEventListener('click', () => {
        this.pendingResolutions.delete(inst.id);
        this.render();
      });
    }
  }

  // ===========================================================
  // Helpers
  // ===========================================================
  private async commit() {
    await this.opts.onKingdomChange(this.opts.kingdom);
  }
}

// ===========================================================
// Top-level helpers
// ===========================================================
function formatDelta(d: any): string {
  const parts: string[] = [];
  const num = (label: string, v: number | undefined) => {
    if (!v) return;
    parts.push(`${v > 0 ? '+' : ''}${v} ${label}`);
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
