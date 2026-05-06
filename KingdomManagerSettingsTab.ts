// =============================================================
// kingdom.ts — derived data + game-state engines
// =============================================================
// Pure functions over KingdomState. No DOM or Obsidian deps. The file is
// organized into five sections, in this order:
//
//   1. Core helpers (lines ~30–285): ability modifiers, control DC, ruin
//      penalty, leadership status, kingdom size, turn-phase advancement.
//      These are used by both the UI and every engine below.
//
//   2. Activity engine (lines ~290–655): legal-activity filtering for the
//      current phase, computing skill checks, rolling, applying outcomes
//      with side effects (Recruit Army auto-creates an army, etc.).
//
//   3. Army roster engine (lines ~660–780): roster summaries and verbs
//      (recruit, train, garrison, deploy, recover, disband, delete).
//
//   4. Event engine (lines ~785–1010): triggering events, attempting
//      resolution, applying outcomes (with continuous-event worsening),
//      ticking continuous events at upkeep, summary computation.
//
//   5. Advancement / level-up engine (lines ~1015–end): XP threshold
//      check, ability cap by level, atomic level-up application.
//
// One day this file should be split per engine. For now, jump to the
// section header with your editor's outline view.

import { computeSettlementSummary, type SettlementSummary } from './summary';
import { BUILDINGS } from './buildings';
import {
  ACTIVITY_LABELS,
  ITEM_TRADITION_LABELS,
  KINGDOM_ABILITIES,
  PROFICIENCY_BONUS,
  TURN_PHASE_ORDER,
  type Activity,
  type ItemTradition,
  type KingdomAbility,
  type KingdomState,
  type LeadershipRole,
  type LeadershipSlot,
  type RuinName,
  type SettlementState,
  type TurnPhase,
} from './types';

// =============================================================
// Ability modifier
// =============================================================

/** Standard PF2e ability modifier: floor((score-10)/2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Skill modifier for a kingdom ability:
 *   ability mod + proficiency bonus (0/2/4/6/8) + level (if trained or higher)
 */
export function skillModifier(kingdom: KingdomState, ability: KingdomAbility): number {
  const score = kingdom.abilities[ability];
  const prof = kingdom.proficiencies[ability];
  const profBonus = PROFICIENCY_BONUS[prof];
  const levelBonus = prof === 'untrained' ? 0 : kingdom.level;
  return abilityModifier(score) + profBonus + levelBonus;
}

// =============================================================
// Size and Control DC
// =============================================================

export type KingdomSize = 'I' | 'II' | 'III' | 'IV';

/** Size category from claimed hexes (per the rules table). */
export function kingdomSize(claimedHexes: number): KingdomSize {
  if (claimedHexes < 10) return 'I';
  if (claimedHexes < 25) return 'II';
  if (claimedHexes < 50) return 'III';
  return 'IV';
}

/** Size modifier penalty applied to certain checks. */
export function sizeMod(size: KingdomSize): number {
  return size === 'I' ? 0 : size === 'II' ? 1 : size === 'III' ? 2 : 3;
}

/**
 * Control DC: the table from the AP. Rough approximation —
 * Level 1 = 14, Level 2 = 15, ... up to level 20 = 40.
 * Add size mod, add ruin penalty.
 */
export function controlDC(kingdom: KingdomState): number {
  const lvl = Math.max(1, Math.min(20, kingdom.level));
  const baseTable = [14, 15, 16, 18, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40];
  const base = baseTable[lvl - 1] ?? 40;
  const size = kingdomSize(kingdom.claimedHexes);
  return base + sizeMod(size) + ruinTotalPenalty(kingdom);
}

// =============================================================
// Ruin
// =============================================================

/** Total active ruin penalty across all four tracks. */
export function ruinTotalPenalty(kingdom: KingdomState): number {
  let total = 0;
  for (const r of Object.values(kingdom.ruin)) total += r.penalty;
  return total;
}

/** Whether a ruin is at threshold (next +1 will increase its penalty). */
export function ruinAtThreshold(kingdom: KingdomState, ruin: RuinName): boolean {
  const r = kingdom.ruin[ruin];
  return r.value >= r.threshold;
}

// =============================================================
// Leadership
// =============================================================

export interface LeadershipStatus {
  filledRoles: LeadershipSlot[];
  vacantRoles: LeadershipSlot[];
  uninvestedRoles: LeadershipSlot[];
  pcRoles: LeadershipSlot[];
  /** Total Unrest gain per turn from vacant Ruler. */
  unrestPerTurnFromVacancies: number;
}

export function leadershipStatus(kingdom: KingdomState): LeadershipStatus {
  const filled: LeadershipSlot[] = [];
  const vacant: LeadershipSlot[] = [];
  const uninvested: LeadershipSlot[] = [];
  const pcs: LeadershipSlot[] = [];

  for (const slot of kingdom.leadership) {
    const isFilled = slot.name.trim().length > 0;
    if (!isFilled) vacant.push(slot);
    else {
      filled.push(slot);
      if (slot.isPC) pcs.push(slot);
      if (!slot.invested) uninvested.push(slot);
    }
  }

  const rulerVacant = vacant.some(s => s.role === 'ruler');
  const enforcerVacant = vacant.some(s => s.role === 'royal-enforcer');
  const unrestPerTurnFromVacancies = (rulerVacant ? 1 : 0) + (enforcerVacant ? 0 : 0);
  // (Royal Enforcer vacancy adds Crime Ruin/turn, not Unrest.)

  return {
    filledRoles: filled,
    vacantRoles: vacant,
    uninvestedRoles: uninvested,
    pcRoles: pcs,
    unrestPerTurnFromVacancies,
  };
}

/**
 * Leadership-activity slots per turn:
 *   Base: 2 + 1 per PC leader
 *   Capital with Castle/Palace/Town Hall: +1
 * Cap: 4 + #PCs (rules-as-written; we use Tom-Eric's reading)
 */
export function leadershipActivitySlots(kingdom: KingdomState, settlements: SettlementState[]): number {
  const status = leadershipStatus(kingdom);
  let slots = 2 + status.pcRoles.length;
  const capital = settlements.find(s => s.isCapital);
  if (capital) {
    const hasSeat = capital.placements.some(p =>
      ['castle', 'palace', 'townhall'].includes(p.buildingId),
    );
    if (hasSeat) slots += 1;
  }
  return slots;
}

// =============================================================
// Turn helpers
// =============================================================

export function nextTurnPhase(current: TurnPhase): { phase: TurnPhase; advancesTurn: boolean } {
  const idx = TURN_PHASE_ORDER.indexOf(current);
  const next = TURN_PHASE_ORDER[(idx + 1) % TURN_PHASE_ORDER.length];
  const advancesTurn = idx === TURN_PHASE_ORDER.length - 1; // civic → upkeep wraps
  return { phase: next, advancesTurn };
}

// =============================================================
// Cross-settlement roll-up
// =============================================================

export interface SettlementRollup {
  /** All settlements in this kingdom. */
  settlements: { state: SettlementState; summary: SettlementSummary }[];
  /** Total population (min..max) summed across settlements. */
  totalPopulation: { min: number; max: number };
  /** Total residential lots. */
  totalResidentialLots: number;
  /** Total filled lots and blocks across all settlements. */
  totalFilledLots: number;
  totalFilledBlocks: number;
  /** Number of settlements by type. */
  countByType: Record<'Village' | 'Town' | 'City' | 'Metropolis', number>;
  /** Summed Consumption from all settlements. */
  totalConsumption: number;
  /** Highest item-level by tradition across the kingdom (with sourcing settlement). */
  bestItemLevels: Record<ItemTradition, { level: number; settlementName: string | null }>;
  /** Activity bonuses kingdom-wide (highest-wins; Treasurer can travel between settlements). */
  activityBonuses: { activity: Activity; label: string; bonus: number; settlementName: string }[];
  /** Capital's name, or null if no capital is set. */
  capitalName: string | null;
  /** Combined warnings from all settlements (deduped). */
  warnings: string[];
  /** Capacity bonus totals (for stockpile caps). */
  totalCapacityBonuses: { food: number; lumber: number; ore: number; stone: number; luxuries: number };
}

export function computeRollup(kingdom: KingdomState, allSettlements: SettlementState[]): SettlementRollup {
  const myset = allSettlements.filter(s => s.kingdomName === kingdom.name);
  const summaries = myset.map(state => ({ state, summary: computeSettlementSummary(state, kingdom) }));

  let popMin = 0, popMax = 0;
  let resLots = 0, filledLots = 0, filledBlocks = 0;
  let consumption = 0;
  let foodCap = 0, lumberCap = 0, oreCap = 0, stoneCap = 0, luxCap = 0;
  const countByType = { Village: 0, Town: 0, City: 0, Metropolis: 0 };
  const warningsSet = new Set<string>();
  let capitalName: string | null = null;

  // Track best item level per tradition + which settlement has it
  const bestLevels: Record<ItemTradition, { level: number; settlementName: string | null }> = {
    base: { level: 0, settlementName: null },
    alchemical: { level: 0, settlementName: null },
    arcane: { level: 0, settlementName: null },
    divine: { level: 0, settlementName: null },
    primal: { level: 0, settlementName: null },
    luxurious: { level: 0, settlementName: null },
  };

  // Track best activity bonus per activity + which settlement
  const bestActivity = new Map<Activity, { bonus: number; settlementName: string }>();

  for (const { state, summary } of summaries) {
    popMin += summary.population.min;
    popMax += summary.population.max;
    resLots += summary.residentialLots;
    filledLots += summary.filledLots;
    filledBlocks += summary.filledBlocks;
    consumption += summary.consumption;
    countByType[summary.type] += 1;
    if (state.isCapital) capitalName = state.name;
    for (const w of summary.warnings) warningsSet.add(`${state.name}: ${w}`);

    foodCap += summary.capacityBonuses.food;
    lumberCap += summary.capacityBonuses.lumber;
    oreCap += summary.capacityBonuses.ore;
    stoneCap += summary.capacityBonuses.stone;
    luxCap += summary.capacityBonuses.luxuries;

    // Item levels: take per-tradition the highest across settlements
    for (const trad of Object.keys(bestLevels) as ItemTradition[]) {
      const il = summary.itemLevels[trad];
      if (il.level > bestLevels[trad].level) {
        bestLevels[trad] = { level: il.level, settlementName: state.name };
      }
    }

    // Activity bonuses: highest-wins across all settlements
    for (const e of summary.activityBonuses) {
      const cur = bestActivity.get(e.activity);
      if (!cur || e.bonus > cur.bonus) {
        bestActivity.set(e.activity, { bonus: e.bonus, settlementName: state.name });
      }
    }
  }

  const activityBonuses = Array.from(bestActivity.entries())
    .map(([activity, info]) => ({
      activity,
      label: ACTIVITY_LABELS[activity] ?? activity,
      bonus: info.bonus,
      settlementName: info.settlementName,
    }))
    .sort((a, b) => b.bonus - a.bonus || a.label.localeCompare(b.label));

  return {
    settlements: summaries,
    totalPopulation: { min: popMin, max: popMax },
    totalResidentialLots: resLots,
    totalFilledLots: filledLots,
    totalFilledBlocks: filledBlocks,
    countByType,
    totalConsumption: consumption,
    bestItemLevels: bestLevels,
    activityBonuses,
    capitalName,
    warnings: Array.from(warningsSet),
    totalCapacityBonuses: { food: foodCap, lumber: lumberCap, ore: oreCap, stone: stoneCap, luxuries: luxCap },
  };
}

// Re-export for convenience
export { ITEM_TRADITION_LABELS, KINGDOM_ABILITIES };

// =============================================================
// Activity engine
// =============================================================
// Pure functions over kingdom state + activity catalogue.
//
//   legalActivitiesFor(...)  — filter the catalogue by current phase, leader
//                              availability, and prerequisites.
//   computeActivityCheck(...) — DC, modifier, item-bonus breakdown for a
//                              given activity.
//   rollActivity(...)        — roll d20 (crypto.getRandomValues), classify
//                              outcome tier, return proposed deltas.
//   applyOutcome(...)        — mutate kingdom + log.

import { ACTIVITIES, ACTIVITY_BY_ID, type ActivityEntry, type OutcomeDelta } from './activities';
import type { ActivityAttempt, OutcomeTier } from './types';

export interface LegalActivityInfo {
  entry: ActivityEntry;
  /** True if this activity can currently be attempted. */
  legal: boolean;
  /** Reasons it's blocked (if any). Shown to user as tooltip. */
  blockedReasons: string[];
  /** Leader name filling the required role, if one is required and present. */
  leaderName: string | null;
  /** Whether the required leader (if any) is invested. Activities by uninvested leaders work but lose ability boosts. */
  leaderInvested: boolean;
}

/**
 * Compute the list of legal activities for the current phase. Activities
 * that fail prereqs or have a vacant required role are still included but
 * marked illegal with reasons.
 */
export function legalActivitiesFor(
  kingdom: KingdomState,
  allSettlements: SettlementState[],
  phase?: TurnPhase,
): LegalActivityInfo[] {
  const targetPhase = phase ?? kingdom.turn.phase;
  const out: LegalActivityInfo[] = [];

  // Collect kingdom-wide building inventory once (for prereq checks)
  const myset = allSettlements.filter(s => s.kingdomName === kingdom.name);
  const buildingInventory = new Set<string>();
  for (const s of myset) {
    for (const p of s.placements) buildingInventory.add(p.buildingId);
  }

  for (const entry of ACTIVITIES) {
    if (entry.phase !== targetPhase) continue;
    const reasons: string[] = [];
    let legal = true;
    let leaderName: string | null = null;
    let leaderInvested = false;

    // Role gating: if the activity requires a role, find the leader filling it
    if (entry.role) {
      const slot = kingdom.leadership.find(l => l.role === entry.role);
      if (!slot || !slot.name.trim()) {
        legal = false;
        reasons.push(`No ${entry.role.replace('-', ' ')} appointed.`);
      } else {
        leaderName = slot.name;
        leaderInvested = slot.invested;
        if (!slot.invested) {
          // Uninvested leaders can still attempt activities but lose ability bonus.
          // We still surface this as a soft warning.
          reasons.push(`${slot.name} is not invested; activity proceeds but without ability bonus.`);
        }
      }
    }

    // Prerequisite checks
    if (entry.prereqs) {
      for (const pre of entry.prereqs) {
        if (pre.buildingId && !buildingInventory.has(pre.buildingId)) {
          legal = false;
          reasons.push(pre.text ?? `Requires building: ${pre.buildingId}`);
        }
        if (pre.minKingdomLevel && kingdom.level < pre.minKingdomLevel) {
          legal = false;
          reasons.push(`Requires kingdom level ${pre.minKingdomLevel}+.`);
        }
      }
    }

    // Slot exhaustion (Leadership phase only)
    if (entry.consumesLeadershipSlot && targetPhase === 'leadership') {
      const slots = leadershipActivitySlots(kingdom, myset);
      if (kingdom.turn.leadershipActivitiesUsed >= slots) {
        legal = false;
        reasons.push(`All ${slots} leadership activity slots used this turn.`);
      }
    }

    // Per-leader phase slot (Commerce / Region) — each leader can take one per phase
    if (entry.consumesLeaderPhaseSlot && entry.role) {
      const used = (kingdom.turn.perLeaderUsed ?? {})[entry.role] ?? 0;
      if (used >= 1) {
        legal = false;
        reasons.push(`${leaderName ?? entry.role} has already taken a ${TURN_PHASE_LABELS_LOWER[targetPhase]} activity this turn.`);
      }
    }

    out.push({ entry, legal, blockedReasons: reasons, leaderName, leaderInvested });
  }

  return out;
}

const TURN_PHASE_LABELS_LOWER: Record<TurnPhase, string> = {
  upkeep: 'upkeep',
  commerce: 'commerce',
  leadership: 'leadership',
  event: 'event',
  civic: 'civic',
};

export interface ActivityCheck {
  /** DC of the check (kingdom Control DC). */
  dc: number;
  /** Total skill modifier applied. */
  modifier: number;
  /** Breakdown for tooltip display. */
  breakdown: { label: string; value: number }[];
  /** Best item bonus from buildings (highest-wins kingdom-wide). */
  itemBonus: number;
  /** Settlement(s) sourcing the item bonus. */
  itemBonusSources: string[];
}

/**
 * Compute the check details (DC + modifier + breakdown) for attempting an
 * activity right now. Pulls best item bonus from the cross-settlement
 * roll-up so the player sees a single number.
 */
export function computeActivityCheck(
  kingdom: KingdomState,
  allSettlements: SettlementState[],
  entry: ActivityEntry,
): ActivityCheck {
  const dc = controlDC(kingdom);
  const skillMod = skillModifier(kingdom, entry.skill);
  const breakdown: { label: string; value: number }[] = [];

  const abMod = abilityModifier(kingdom.abilities[entry.skill]);
  breakdown.push({ label: `${entry.skill} mod`, value: abMod });
  const profKey = kingdom.proficiencies[entry.skill];
  // Get prof + level numbers from the formula already in skillModifier
  // For display we recompute the components.
  // (skillMod = abMod + profBonus + (level if trained))
  const PROFICIENCY_BONUS_LOCAL: Record<typeof profKey, number> = {
    untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8,
  } as any;
  const profBonus = PROFICIENCY_BONUS_LOCAL[profKey];
  if (profBonus > 0) breakdown.push({ label: `proficiency (${profKey})`, value: profBonus });
  const levelBonus = profKey === 'untrained' ? 0 : kingdom.level;
  if (levelBonus > 0) breakdown.push({ label: 'level', value: levelBonus });

  // Investment bonus: leader of the activity's role must be invested for the role's ability to apply.
  // For activities not tied to the chosen ability, the bonus from the leader's role isn't applied here
  // — the kingdom abilities already include the +X invested-leader bumps if the user has been editing
  // their ability scores accordingly.

  // Item bonus: if the activity has an itemBonusKey, look up best in kingdom.
  let itemBonus = 0;
  const itemBonusSources: string[] = [];
  if (entry.itemBonusKey) {
    const myset = allSettlements.filter(s => s.kingdomName === kingdom.name);
    for (const s of myset) {
      let best = 0;
      for (const p of s.placements) {
        const meta = BUILDINGS[p.buildingId];
        if (!meta?.itemBonuses) continue;
        for (const ib of meta.itemBonuses) {
          if (ib.activity === entry.itemBonusKey && ib.bonus > best) best = ib.bonus;
        }
      }
      if (best > itemBonus) {
        itemBonus = best;
        itemBonusSources.length = 0;
        itemBonusSources.push(s.name);
      } else if (best > 0 && best === itemBonus) {
        itemBonusSources.push(s.name);
      }
    }
  }
  if (itemBonus > 0) breakdown.push({ label: `item (best from ${itemBonusSources.join(', ')})`, value: itemBonus });

  // Ruin penalty applies to all kingdom checks
  const rp = ruinTotalPenalty(kingdom);
  if (rp > 0) breakdown.push({ label: 'ruin penalty', value: -rp });

  const modifier = skillMod + itemBonus - rp;
  return { dc, modifier, breakdown, itemBonus, itemBonusSources };
}

/**
 * Cryptographically-random d20 roll. Falls back to Math.random in environments
 * without crypto (shouldn't happen in Obsidian / Node).
 */
export function rollD20(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % 20) + 1;
  }
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Classify an outcome tier from total roll vs DC, per PF2e rules:
 *   total ≥ DC + 10  → critical success
 *   total ≥ DC       → success
 *   total ≥ DC − 10  → failure
 *   total <  DC − 10 → critical failure
 *   PLUS: nat 20 bumps tier up by one; nat 1 bumps tier down by one.
 */
export function classifyOutcome(total: number, dc: number, d20: number): OutcomeTier {
  let tier: OutcomeTier;
  if (total >= dc + 10) tier = 'critical-success';
  else if (total >= dc) tier = 'success';
  else if (total >= dc - 10) tier = 'failure';
  else tier = 'critical-failure';

  // Apply nat-20 / nat-1 adjustment
  const tiers: OutcomeTier[] = ['critical-failure', 'failure', 'success', 'critical-success'];
  const idx = tiers.indexOf(tier);
  if (d20 === 20 && idx < 3) tier = tiers[idx + 1];
  else if (d20 === 1 && idx > 0) tier = tiers[idx - 1];

  return tier;
}

/**
 * Roll an activity check and return the proposed attempt record. The caller
 * (the view) presents this to the GM for confirmation/override before
 * applying with `applyAttempt`.
 */
export function rollActivity(
  kingdom: KingdomState,
  allSettlements: SettlementState[],
  entry: ActivityEntry,
): ActivityAttempt {
  const check = computeActivityCheck(kingdom, allSettlements, entry);
  const d20 = rollD20();
  const total = d20 + check.modifier;
  const outcome = classifyOutcome(total, check.dc, d20);
  return {
    id: cryptoRandomId(),
    activityId: entry.id,
    turn: kingdom.turn.number,
    phase: kingdom.turn.phase,
    leaderRole: entry.role,
    d20,
    modifier: check.modifier,
    total,
    dc: check.dc,
    outcome,
    overridden: false,
  };
}

/**
 * Apply a confirmed attempt: mutate kingdom resources/status per the
 * activity's outcome deltas, push the attempt onto turn.attempts, consume
 * leader/leadership slots, and log a corresponding entry to the event log.
 */
export function applyAttempt(
  kingdom: KingdomState,
  attempt: ActivityAttempt,
): void {
  const entry = ACTIVITY_BY_ID[attempt.activityId];
  if (!entry) return;

  // Apply outcome deltas (skip if the activity is manual-outcome only)
  if (entry.outcomes && !entry.manualOutcome) {
    const delta = entry.outcomes[attempt.outcome];
    applyDelta(kingdom, delta);
  } else if (entry.outcomes) {
    // For manual-outcome activities we still apply numeric deltas if any
    // (e.g. the ones with explicit unrest changes), but skip text-only ones.
    const delta = entry.outcomes[attempt.outcome];
    applyDelta(kingdom, delta);
  }

  // Activity-specific side effects beyond simple resource deltas.
  // (Currently only Recruit Army creates persistent state; Train/Garrison/
  // Recover require selecting a target army and are best done in the army
  // roster view. Their outcome deltas above still apply.)
  applyActivitySideEffects(kingdom, entry, attempt);

  // Consume slots
  if (entry.consumesLeadershipSlot) {
    kingdom.turn.leadershipActivitiesUsed += 1;
  }
  if (entry.consumesLeaderPhaseSlot && entry.role) {
    if (!kingdom.turn.perLeaderUsed) kingdom.turn.perLeaderUsed = {};
    kingdom.turn.perLeaderUsed[entry.role] = (kingdom.turn.perLeaderUsed[entry.role] ?? 0) + 1;
  }

  // Push to attempt history
  if (!kingdom.turn.attempts) kingdom.turn.attempts = [];
  kingdom.turn.attempts.push(attempt);

  // Push to event log so it's part of the kingdom narrative
  const tierLabel = ({
    'critical-success': 'Critical Success',
    success: 'Success',
    failure: 'Failure',
    'critical-failure': 'Critical Failure',
  } as const)[attempt.outcome];
  const lines: string[] = [
    `Roll: d20 = ${attempt.d20}, +${attempt.modifier} → total ${attempt.total} vs DC ${attempt.dc} → ${tierLabel}${attempt.overridden ? ' (overridden)' : ''}.`,
  ];
  if (entry.outcomes?.[attempt.outcome]?.text) {
    lines.push(entry.outcomes[attempt.outcome].text!);
  }
  if (attempt.notes) lines.push(`GM notes: ${attempt.notes}`);
  kingdom.events.unshift({
    id: cryptoRandomId(),
    turn: attempt.turn,
    phase: attempt.phase,
    title: `${entry.name} — ${tierLabel}`,
    notes: lines.join('\n'),
    expanded: false,
  });
}

/**
 * Apply activity-specific side effects beyond resource deltas. Currently:
 *   - Recruit Army (success+) creates a new army record on the kingdom roster.
 * Other army-targeting activities (Train/Garrison/Recover) are left to the
 * army roster view, since they need a target picker.
 */
function applyActivitySideEffects(kingdom: KingdomState, entry: ActivityEntry, attempt: ActivityAttempt): void {
  if (entry.id === 'recruit-army') {
    if (attempt.outcome === 'success' || attempt.outcome === 'critical-success') {
      const isCrit = attempt.outcome === 'critical-success';
      const level = Math.max(1, kingdom.level);
      const name = `New Army ${kingdom.turn.number}.${(Object.keys(kingdom.armies ?? {}).length + 1)}`;
      const army = recruitArmyForKingdom(kingdom, name, level, 'infantry', isCrit);
      // We don't have a clean way to surface the new army id to the caller;
      // the UI re-renders and the army appears in the roster.
      void army;
    }
  }
}

/** Apply numeric deltas to kingdom state. Mutates in place. */
function applyDelta(kingdom: KingdomState, delta: OutcomeDelta): void {
  if (delta.rp) kingdom.stockpiles.rp = Math.max(0, kingdom.stockpiles.rp + delta.rp);
  if (delta.food) kingdom.stockpiles.food = Math.max(0, kingdom.stockpiles.food + delta.food);
  if (delta.lumber) kingdom.stockpiles.lumber = Math.max(0, kingdom.stockpiles.lumber + delta.lumber);
  if (delta.luxuries) kingdom.stockpiles.luxuries = Math.max(0, kingdom.stockpiles.luxuries + delta.luxuries);
  if (delta.ore) kingdom.stockpiles.ore = Math.max(0, kingdom.stockpiles.ore + delta.ore);
  if (delta.stone) kingdom.stockpiles.stone = Math.max(0, kingdom.stockpiles.stone + delta.stone);
  if (delta.unrest) kingdom.unrest = Math.max(0, kingdom.unrest + delta.unrest);
  if (delta.fame) kingdom.fame = Math.max(0, kingdom.fame + delta.fame);
  if (delta.xp) kingdom.xp += delta.xp;
  if (delta.corruption) kingdom.ruin.corruption.value = Math.max(0, kingdom.ruin.corruption.value + delta.corruption);
  if (delta.crime) kingdom.ruin.crime.value = Math.max(0, kingdom.ruin.crime.value + delta.crime);
  if (delta.decay) kingdom.ruin.decay.value = Math.max(0, kingdom.ruin.decay.value + delta.decay);
  if (delta.strife) kingdom.ruin.strife.value = Math.max(0, kingdom.ruin.strife.value + delta.strife);
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as Crypto).randomUUID();
  return 'a_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// =============================================================
// Army roster engine
// =============================================================
// Pure functions that mutate the army roster on a kingdom. These are the
// effects of the warfare-related activities. The engine doesn't enforce
// every tactical edge case; it manages the persistent state (HP, status,
// location, gear) and the catalogue-aware verbs (recruit, train, etc.).

import { makeArmy, type ArmyState, type ArmyType, type ArmyStatus, type ArmyCondition, baseStatsFor } from './armies';

export interface ArmyRosterSummary {
  /** All armies for this kingdom, in alphabetical order. */
  armies: ArmyState[];
  /** Counts by status. */
  byStatus: Record<ArmyStatus, number>;
  /** Total army count. */
  total: number;
  /** Total Consumption from armies (1 per army by default; gear/tactics can modify). */
  consumption: number;
  /** Warnings to surface (e.g., low-HP armies, defeated armies that haven't been recovered). */
  warnings: string[];
}

export function computeArmyRosterSummary(kingdom: KingdomState): ArmyRosterSummary {
  const armies = Object.values(kingdom.armies).sort((a, b) => a.name.localeCompare(b.name));
  const byStatus: Record<ArmyStatus, number> = {
    mobilized: 0, garrisoned: 0, recovering: 0, defeated: 0, disbanded: 0,
  };
  for (const a of armies) byStatus[a.status]++;
  // Each non-disbanded army costs 1 Consumption per turn by default
  const consumption = armies.filter(a => a.status !== 'disbanded').length;
  const warnings: string[] = [];
  for (const a of armies) {
    if (a.status === 'defeated') {
      warnings.push(`${a.name} is defeated; needs Recover Army to restore.`);
    } else if (a.hp <= a.maxHp / 4 && a.status !== 'disbanded') {
      warnings.push(`${a.name} is at low HP (${a.hp}/${a.maxHp}); consider Recover Army.`);
    }
  }
  return { armies, byStatus, total: armies.length, consumption, warnings };
}

/** Add a freshly-recruited army to the roster. */
export function recruitArmyForKingdom(
  kingdom: KingdomState,
  name: string,
  level: number,
  type: ArmyType,
  bonusFromCritSuccess = false,
): ArmyState {
  const army = makeArmy(name, level, type);
  if (bonusFromCritSuccess) {
    army.conditions = ['efficient'];
  }
  kingdom.armies[army.id] = army;
  return army;
}

/** Increase an army's level by 1, recompute max HP, scale current HP proportionally. */
export function trainArmy(army: ArmyState, levelsGained = 1): void {
  const oldMax = army.maxHp;
  army.level = Math.min(20, army.level + levelsGained);
  const stats = baseStatsFor(army.level, army.type);
  army.maxHp = stats.hp;
  // Preserve the percentage of HP the army had
  const ratio = oldMax > 0 ? army.hp / oldMax : 1;
  army.hp = Math.round(stats.hp * ratio);
}

/** Garrison an army at the given settlement. */
export function garrisonArmy(army: ArmyState, settlementId: string | undefined): void {
  army.status = 'garrisoned';
  army.settlementId = settlementId;
  army.hexKey = undefined;
  // Garrisoned armies gain Fortified
  if (!army.conditions.includes('fortified')) {
    army.conditions.push('fortified');
  }
}

/** Deploy an army to a hex. Sets status mobilized. */
export function deployArmy(army: ArmyState, hexKey: string | undefined): void {
  army.status = 'mobilized';
  army.hexKey = hexKey;
  // Deploying clears Fortified (lost defensive position) and Garrisoned link
  army.conditions = army.conditions.filter(c => c !== 'fortified');
  army.settlementId = undefined;
}

/** Recover an army: heal HP, remove negative conditions. */
export function recoverArmy(army: ArmyState, fullRecover = false): void {
  if (fullRecover) {
    army.hp = army.maxHp;
    army.conditions = army.conditions.filter(c => c === 'efficient' || c === 'recovered');
  } else {
    // Heal a portion (50%)
    const heal = Math.ceil(army.maxHp * 0.5);
    army.hp = Math.min(army.maxHp, army.hp + heal);
    // Remove the worst conditions
    const negative: ArmyCondition[] = ['weakened', 'fatigued', 'shaken', 'mired'];
    army.conditions = army.conditions.filter(c => !negative.includes(c));
  }
  // Mark as recovering for next phase to take effect, then mobilize if HP is full
  if (army.hp === army.maxHp) {
    army.status = 'mobilized';
    if (!army.conditions.includes('recovered')) {
      army.conditions.push('recovered');
    }
  } else {
    army.status = 'recovering';
  }
}

/** Disband an army (soft-delete; keeps record for narrative reference). */
export function disbandArmy(army: ArmyState): void {
  army.status = 'disbanded';
  army.hp = 0;
  army.conditions = [];
}

/** Hard-delete an army from the roster. Use with caution. */
export function deleteArmy(kingdom: KingdomState, armyId: string): void {
  delete kingdom.armies[armyId];
}


// =============================================================
// Event engine
// =============================================================
// Pure functions over kingdom events. Mirrors the activity engine:
//   rollKingdomEvent / triggerEventInstance — fire a new event
//   attemptEventResolution — roll a d20 + skill against DC, classify tier
//   applyEventResolution — mutate kingdom + log; mark event resolved/worsened
//   tickContinuousEvents — applied at Upkeep phase advance

import {
  EVENT_BY_ID,
  EVENTS,
  rollEventTable,
  makeEventInstance,
  type EventDelta,
  type EventEntry,
  type EventInstance,
  type ResolutionAttempt,
} from './events';

/**
 * Trigger a new event instance on the kingdom. If `eventId` is provided,
 * use that specific event; otherwise roll on the table.
 *
 * Beneficial / one-shot events are added; continuous events stay around
 * until resolved.
 */
export function triggerEventInstance(
  kingdom: KingdomState,
  eventId?: string,
): EventInstance {
  const entry = eventId ? EVENT_BY_ID[eventId] : rollEventTable();
  const instance = makeEventInstance(entry.id, kingdom.turn.number);
  kingdom.eventInstances[instance.id] = instance;

  // Log to event log
  kingdom.events.unshift({
    id: cryptoRandomId(),
    turn: kingdom.turn.number,
    phase: kingdom.turn.phase,
    title: `Event: ${entry.name}`,
    notes: entry.description,
    expanded: false,
  });

  return instance;
}

/**
 * Roll a resolution attempt for an event. Returns the proposed attempt
 * record for the GM to confirm/override before applying.
 */
export function attemptEventResolution(
  kingdom: KingdomState,
  instance: EventInstance,
  skill: KingdomAbility,
): ResolutionAttempt {
  const dc = controlDC(kingdom) + (instance.dcModifier ?? 0);
  const skillMod = skillModifier(kingdom, skill);
  const ruinPen = ruinTotalPenalty(kingdom);
  const modifier = skillMod - ruinPen;
  const d20 = rollD20();
  const total = d20 + modifier;
  const outcome = classifyOutcome(total, dc, d20);
  return {
    id: cryptoRandomId(),
    turn: kingdom.turn.number,
    skill,
    d20,
    modifier,
    total,
    dc,
    outcome,
    overridden: false,
  };
}

/**
 * Apply a confirmed resolution attempt: mutate kingdom resources per the
 * event's outcome deltas, push the attempt onto the event instance's
 * history, update its status (resolved/worsened/active), and log to
 * the event log.
 */
export function applyEventResolution(
  kingdom: KingdomState,
  instance: EventInstance,
  attempt: ResolutionAttempt,
): void {
  const entry = EVENT_BY_ID[instance.eventId];
  if (!entry) return;

  const delta = entry.outcomes?.[attempt.outcome];
  if (delta && !entry.manualOutcome) {
    applyEventDelta(kingdom, delta);
  } else if (delta) {
    // Manual-outcome events still apply numeric deltas (so unrest still
    // increments, but the rules-text effect is left to the GM).
    applyEventDelta(kingdom, delta);
  }

  // Update instance status based on the delta's flags
  if (delta?.resolves) {
    instance.status = 'resolved';
  } else if (delta?.worsens) {
    instance.status = 'worsened';
    instance.dcModifier = (instance.dcModifier ?? 0) + 2;
  }
  // For non-continuous events, a non-resolves outcome still "ends" the event
  // (one-shot events resolve in a single attempt regardless of tier).
  if (entry.kind !== 'continuous' && instance.status === 'active') {
    if (attempt.outcome === 'critical-failure' || attempt.outcome === 'failure') {
      instance.status = 'failed';
    } else {
      instance.status = 'resolved';
    }
  }

  // Push attempt to instance history
  instance.attempts.push(attempt);

  // Log to event log
  const tierLabel = ({
    'critical-success': 'Critical Success',
    success: 'Success',
    failure: 'Failure',
    'critical-failure': 'Critical Failure',
  } as const)[attempt.outcome];
  const lines: string[] = [
    `Resolution roll: d20 = ${attempt.d20}, +${attempt.modifier} → total ${attempt.total} vs DC ${attempt.dc} → ${tierLabel}${attempt.overridden ? ' (overridden)' : ''}.`,
  ];
  if (delta?.text) lines.push(delta.text);
  if (attempt.notes) lines.push(`GM notes: ${attempt.notes}`);
  kingdom.events.unshift({
    id: cryptoRandomId(),
    turn: kingdom.turn.number,
    phase: kingdom.turn.phase,
    title: `${entry.name} — ${tierLabel}`,
    notes: lines.join('\n'),
    expanded: false,
  });
}

/**
 * Tick all continuous events at Upkeep: apply each event's per-turn upkeep
 * effect to the kingdom. Returns a summary of effects applied (for UI).
 */
export interface UpkeepTickSummary {
  eventName: string;
  eventId: string;
  effectText: string;
}
export function tickContinuousEvents(kingdom: KingdomState): UpkeepTickSummary[] {
  const summaries: UpkeepTickSummary[] = [];
  for (const inst of Object.values(kingdom.eventInstances)) {
    if (inst.status !== 'active' && inst.status !== 'worsened') continue;
    const entry = EVENT_BY_ID[inst.eventId];
    if (!entry || entry.kind !== 'continuous' || !entry.upkeepEffect) continue;
    applyEventDelta(kingdom, entry.upkeepEffect);
    summaries.push({
      eventName: entry.name,
      eventId: entry.id,
      effectText: entry.upkeepEffect.text ?? 'Continuous effect applied.',
    });
  }
  return summaries;
}

/** Dismiss an event (GM-driven cleanup). */
export function dismissEventInstance(kingdom: KingdomState, instanceId: string): void {
  const inst = kingdom.eventInstances[instanceId];
  if (inst) inst.status = 'dismissed';
}

/** Hard-delete an event instance. */
export function deleteEventInstance(kingdom: KingdomState, instanceId: string): void {
  delete kingdom.eventInstances[instanceId];
}

/** Apply an event delta (mirrors applyDelta but separate for clarity). */
function applyEventDelta(kingdom: KingdomState, delta: EventDelta): void {
  if (delta.rp) kingdom.stockpiles.rp = Math.max(0, kingdom.stockpiles.rp + delta.rp);
  if (delta.food) kingdom.stockpiles.food = Math.max(0, kingdom.stockpiles.food + delta.food);
  if (delta.lumber) kingdom.stockpiles.lumber = Math.max(0, kingdom.stockpiles.lumber + delta.lumber);
  if (delta.luxuries) kingdom.stockpiles.luxuries = Math.max(0, kingdom.stockpiles.luxuries + delta.luxuries);
  if (delta.ore) kingdom.stockpiles.ore = Math.max(0, kingdom.stockpiles.ore + delta.ore);
  if (delta.stone) kingdom.stockpiles.stone = Math.max(0, kingdom.stockpiles.stone + delta.stone);
  if (delta.unrest) kingdom.unrest = Math.max(0, kingdom.unrest + delta.unrest);
  if (delta.fame) kingdom.fame = Math.max(0, kingdom.fame + delta.fame);
  if (delta.xp) kingdom.xp += delta.xp;
  if (delta.corruption) kingdom.ruin.corruption.value = Math.max(0, kingdom.ruin.corruption.value + delta.corruption);
  if (delta.crime) kingdom.ruin.crime.value = Math.max(0, kingdom.ruin.crime.value + delta.crime);
  if (delta.decay) kingdom.ruin.decay.value = Math.max(0, kingdom.ruin.decay.value + delta.decay);
  if (delta.strife) kingdom.ruin.strife.value = Math.max(0, kingdom.ruin.strife.value + delta.strife);
}

export interface EventInstanceSummary {
  active: EventInstance[];
  resolved: EventInstance[];
  total: number;
  /** Counts active continuous events that are upcoming-tick on next Upkeep. */
  continuousTicking: number;
  /** Warnings (worsened events that need urgent attention). */
  warnings: string[];
}

export function computeEventSummary(kingdom: KingdomState): EventInstanceSummary {
  const all = Object.values(kingdom.eventInstances);
  const active = all.filter(i => i.status === 'active' || i.status === 'worsened').sort((a, b) => a.startTurn - b.startTurn);
  const resolved = all.filter(i => i.status === 'resolved' || i.status === 'failed' || i.status === 'dismissed').sort((a, b) => b.startTurn - a.startTurn);
  let continuousTicking = 0;
  const warnings: string[] = [];
  for (const inst of active) {
    const entry = EVENT_BY_ID[inst.eventId];
    if (!entry) continue;
    if (entry.kind === 'continuous') continuousTicking++;
    if (inst.status === 'worsened') {
      warnings.push(`${entry.name} has worsened — DC +${inst.dcModifier} on next attempt.`);
    }
  }
  return {
    active,
    resolved,
    total: all.length,
    continuousTicking,
    warnings,
  };
}

// =============================================================
// Advancement / level-up engine
// =============================================================
// Pure functions over the level-up flow. The wizard collects user choices,
// then calls applyLevelUp() which mutates the kingdom atomically: zero XP,
// bump level, apply boosts, apply skill increase, push feat ids.

import type { Proficiency } from './types';

/** XP threshold to gain a level. */
export const XP_PER_LEVEL = 1000;

/** Hard cap on any individual ability score, by current kingdom level. */
export function abilityCapForLevel(level: number): number {
  if (level < 5) return 18;
  if (level < 15) return 22;
  return 25;
}

/** Returns true if the kingdom has accumulated enough XP to level up. */
export function canLevelUp(kingdom: KingdomState): boolean {
  return kingdom.xp >= XP_PER_LEVEL && kingdom.level < 20;
}

export interface LevelUpChoices {
  /**
   * Four ability boosts. Each boost adds +2 to the chosen ability. Per the
   * rules, you typically can't put two boosts on the same ability in the
   * same level-up — but we soft-warn rather than hard-block (mixed validation).
   * The hard rule is the cap from abilityCapForLevel().
   */
  boosts: KingdomAbility[];
  /**
   * Skill (= ability) to increase proficiency on. Only applicable when the
   * target level grants a skill increase. Promotes one rank: untrained →
   * trained → expert → master → legendary.
   */
  skillIncrease?: KingdomAbility;
  /**
   * General feat id selected at this level (if a feat is granted).
   */
  generalFeatId?: string;
}

/** Bump proficiency rank by one step. Cap at legendary. */
function bumpProficiency(rank: Proficiency): Proficiency {
  switch (rank) {
    case 'untrained': return 'trained';
    case 'trained': return 'expert';
    case 'expert': return 'master';
    case 'master': return 'legendary';
    case 'legendary': return 'legendary';
  }
}

/** Validate that all boosts respect the ability cap; returns the first violation, or null if OK. */
export function validateBoostsAgainstCap(
  kingdom: KingdomState,
  boosts: KingdomAbility[],
  newLevel: number,
): { ability: KingdomAbility; current: number; cap: number } | null {
  const cap = abilityCapForLevel(newLevel);
  // Tally projected ability values: each boost adds +2 to the chosen ability
  const projected: Record<KingdomAbility, number> = { ...kingdom.abilities };
  for (const a of boosts) {
    projected[a] = (projected[a] ?? 10) + 2;
    if (projected[a] > cap) {
      return { ability: a, current: kingdom.abilities[a], cap };
    }
  }
  return null;
}

/**
 * Apply a confirmed level-up to the kingdom, mutating it atomically.
 * Caller is responsible for showing any UI confirmation; this function
 * trusts the choices it receives and only enforces the ability-cap rule
 * (which is a true rules invariant).
 *
 * Throws if the cap would be violated. Other rules (one-boost-per-ability,
 * feat-prerequisites) are validated by the wizard with warnings, not here.
 */
export function applyLevelUp(kingdom: KingdomState, choices: LevelUpChoices): void {
  const newLevel = kingdom.level + 1;

  // Hard validation: ability cap
  const violation = validateBoostsAgainstCap(kingdom, choices.boosts, newLevel);
  if (violation) {
    throw new Error(
      `Boost would push ${violation.ability} to ${violation.current + 2}, over the cap of ${violation.cap} for level ${newLevel}.`,
    );
  }

  // Spend XP and bump level
  kingdom.xp = Math.max(0, kingdom.xp - XP_PER_LEVEL);
  kingdom.level = newLevel;

  // Apply ability boosts (+2 each)
  for (const a of choices.boosts) {
    kingdom.abilities[a] = (kingdom.abilities[a] ?? 10) + 2;
  }

  // Apply skill increase if applicable
  if (choices.skillIncrease) {
    const current = kingdom.proficiencies[choices.skillIncrease];
    kingdom.proficiencies[choices.skillIncrease] = bumpProficiency(current);
  }

  // Add the picked general feat to the kingdom's feat list
  if (choices.generalFeatId && !kingdom.feats.includes(choices.generalFeatId)) {
    kingdom.feats.push(choices.generalFeatId);
  }

  // Log to event log
  const lines: string[] = [
    `Reached kingdom level ${newLevel}.`,
    `Ability boosts: ${choices.boosts.join(', ')} (+2 each).`,
  ];
  if (choices.skillIncrease) {
    lines.push(`Skill increase: ${choices.skillIncrease} promoted to ${kingdom.proficiencies[choices.skillIncrease]}.`);
  }
  if (choices.generalFeatId) {
    lines.push(`Selected feat: ${choices.generalFeatId}.`);
  }
  kingdom.events.unshift({
    id: cryptoRandomId(),
    turn: kingdom.turn.number,
    phase: kingdom.turn.phase,
    title: `Level up — Lvl ${newLevel}`,
    notes: lines.join('\n'),
    expanded: false,
  });
}
