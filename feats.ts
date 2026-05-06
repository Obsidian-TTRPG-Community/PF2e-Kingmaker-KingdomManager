// =============================================================
// Kingdom event catalogue
// =============================================================
// Pathfinder 2e Kingmaker AP — kingdom event system.
//
// Each turn's Event phase, the kingdom rolls a "kingdom event check"
// (or rolls on the event table directly). On a positive result, an event
// fires; on certain rolls, persistent events tick again or worsen.
//
// We model:
//   - ~15 well-modelled events with full per-tier outcome deltas
//   - ~5 stubs with rules text only (manual outcome)
//   - Beneficial vs continuous flag (continuous events tick each turn until resolved)
//   - Per-event resolution skill (some have "this skill OR that skill")
//
// As with the activity catalogue, the rules text I'm modelling is best-
// effort from the AP appendices. Per-event `notes` and free-form override
// fields let GMs adjudicate at the table.

import type { KingdomAbility, OutcomeTier, TurnPhase } from './types';

/** Kind of event. */
export type EventKind = 'beneficial' | 'continuous' | 'oneshot';

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  beneficial: 'Beneficial',
  continuous: 'Continuous',
  oneshot: 'One-shot',
};

/** Which phase the event was rolled in (usually 'event'). */

/** Outcome deltas — same shape as activities. */
export interface EventDelta {
  rp?: number;
  food?: number;
  lumber?: number;
  luxuries?: number;
  ore?: number;
  stone?: number;
  unrest?: number;
  fame?: number;
  corruption?: number;
  crime?: number;
  decay?: number;
  strife?: number;
  xp?: number;
  /** Free-text effect description shown in the dialog. */
  text?: string;
  /**
   * If true, after applying these deltas, the event is considered RESOLVED
   * (won't tick again). For continuous events, success/critical-success
   * usually resolve; failure/crit-failure usually keep them active.
   */
  resolves?: boolean;
  /**
   * If true, the event WORSENS (DC for next attempt increases by 2).
   * Continuous events with a critical failure typically worsen.
   */
  worsens?: boolean;
}

/** Per-tier outcome bundle. */
export interface EventOutcomes {
  'critical-success': EventDelta;
  success: EventDelta;
  failure: EventDelta;
  'critical-failure': EventDelta;
}

/** Catalogue entry. */
export interface EventEntry {
  /** Stable id. */
  id: string;
  /** Display name. */
  name: string;
  /** Beneficial / continuous / oneshot. */
  kind: EventKind;
  /** Short rules-text description. Shown on the event card. */
  description: string;
  /**
   * Skills that can be used to resolve. The user picks one when rolling.
   * If a beneficial or one-shot event has no resolution check, leave empty.
   */
  resolutionSkills: KingdomAbility[];
  /** Outcomes per success tier. Optional for events that don't take a check. */
  outcomes?: EventOutcomes;
  /**
   * Per-turn upkeep effect for continuous events (applied every Upkeep
   * phase until resolved). null/undefined for one-shot/beneficial events.
   */
  upkeepEffect?: EventDelta;
  /**
   * Free-form rules-text effect. Shown verbatim in the dialog.
   */
  rulesText?: string;
  /** If true, engine doesn't auto-apply outcome deltas. */
  manualOutcome?: boolean;
}

// =============================================================
// Catalogue (~15 well-modelled + ~5 stubs)
// =============================================================

export const EVENTS: EventEntry[] = [
  // -----------------------------------------------------------
  // Continuous events (tick each Upkeep until resolved)
  // -----------------------------------------------------------
  {
    id: 'bandit-activity',
    name: 'Bandit Activity',
    kind: 'continuous',
    description: 'Bandits prey on the highways and outlying farms. Caravans plundered, villagers harassed.',
    resolutionSkills: ['warfare', 'intrigue'],
    upkeepEffect: { rp: -1, crime: 1, text: 'Each Upkeep: lose 1 RP and gain 1 Crime until resolved.' },
    outcomes: {
      'critical-success': { fame: 1, text: 'Bandits routed and their leaders captured. +1 Fame.', resolves: true },
      success: { text: 'Bandits driven off.', resolves: true },
      failure: { unrest: 1, text: 'Bandits still active. +1 Unrest from continued raids.' },
      'critical-failure': { unrest: 2, crime: 1, text: 'Bandits emboldened. +2 Unrest, +1 Crime.', worsens: true },
    },
  },
  {
    id: 'cult-activity',
    name: 'Cult Activity',
    kind: 'continuous',
    description: 'A heretical cult takes root, corrupting the faithful and worshipping forbidden powers.',
    resolutionSkills: ['folklore', 'intrigue', 'magic'],
    upkeepEffect: { corruption: 1, text: 'Each Upkeep: +1 Corruption until resolved.' },
    outcomes: {
      'critical-success': { fame: 1, corruption: -1, text: 'Cult exposed and dismantled. +1 Fame, -1 Corruption.', resolves: true },
      success: { text: 'Cult disbanded.', resolves: true },
      failure: { unrest: 1, text: 'Cult still operating. +1 Unrest.' },
      'critical-failure': { unrest: 2, corruption: 1, text: 'Cult grows. +2 Unrest, +1 Corruption.', worsens: true },
    },
  },
  {
    id: 'crop-failure',
    name: 'Crop Failure',
    kind: 'continuous',
    description: 'Blight, drought, or pest infestation devastates farmland. Food supplies dwindle.',
    resolutionSkills: ['agriculture', 'wilderness', 'magic'],
    upkeepEffect: { food: -2, text: 'Each Upkeep: -2 Food until resolved.' },
    outcomes: {
      'critical-success': { food: 2, text: 'Crisis averted with abundance. +2 Food.', resolves: true },
      success: { text: 'Harvest recovers.', resolves: true },
      failure: { unrest: 1, text: 'Hunger spreads. +1 Unrest.' },
      'critical-failure': { unrest: 2, food: -1, text: 'Famine. +2 Unrest, -1 Food.', worsens: true },
    },
  },
  {
    id: 'plague',
    name: 'Plague',
    kind: 'continuous',
    description: 'Disease sweeps the kingdom. Healers strain to contain it.',
    resolutionSkills: ['defense', 'folklore', 'magic'],
    upkeepEffect: { unrest: 1, decay: 1, text: 'Each Upkeep: +1 Unrest, +1 Decay until contained.' },
    outcomes: {
      'critical-success': { fame: 1, text: 'Plague contained quickly. +1 Fame.', resolves: true },
      success: { text: 'Plague contained.', resolves: true },
      failure: { unrest: 1, text: 'Plague spreads. +1 Unrest.' },
      'critical-failure': { unrest: 3, decay: 2, text: 'Outbreak overwhelms healers. +3 Unrest, +2 Decay.', worsens: true },
    },
  },
  {
    id: 'monster-attack',
    name: 'Monster Attack',
    kind: 'continuous',
    description: 'A monstrous threat menaces the kingdom — a dragon, troll, or worse.',
    resolutionSkills: ['warfare', 'wilderness'],
    upkeepEffect: { rp: -2, text: 'Each Upkeep: lose 2 RP to defensive measures and damages until slain.' },
    outcomes: {
      'critical-success': { fame: 2, xp: 80, text: 'Beast slain in epic fashion. +2 Fame, +80 XP.', resolves: true },
      success: { fame: 1, xp: 40, text: 'Beast slain. +1 Fame, +40 XP.', resolves: true },
      failure: { unrest: 2, text: 'Beast escapes. +2 Unrest.' },
      'critical-failure': { unrest: 3, strife: 1, text: 'Beast rampages. +3 Unrest, +1 Strife.', worsens: true },
    },
  },
  {
    id: 'undead-uprising',
    name: 'Undead Uprising',
    kind: 'continuous',
    description: 'Restless dead rise from cemeteries, battlefields, or ancient ruins.',
    resolutionSkills: ['folklore', 'magic', 'warfare'],
    upkeepEffect: { decay: 1, strife: 1, text: 'Each Upkeep: +1 Decay, +1 Strife until put down.' },
    outcomes: {
      'critical-success': { fame: 1, text: 'Undead returned to rest with sacred ritual. +1 Fame.', resolves: true },
      success: { text: 'Undead defeated.', resolves: true },
      failure: { unrest: 2, text: 'Dead still walk. +2 Unrest.' },
      'critical-failure': { unrest: 3, decay: 2, text: 'Undead horde grows. +3 Unrest, +2 Decay.', worsens: true },
    },
  },
  {
    id: 'inquisition',
    name: 'Inquisition',
    kind: 'continuous',
    description: 'Religious zealots conduct witch hunts and demand heretics be punished.',
    resolutionSkills: ['statecraft', 'politics', 'folklore'],
    upkeepEffect: { unrest: 1, strife: 1, text: 'Each Upkeep: +1 Unrest, +1 Strife from public trials.' },
    outcomes: {
      'critical-success': { fame: 1, text: 'Inquisition redirected; reformers gain favour. +1 Fame.', resolves: true },
      success: { text: 'Inquisition disbanded.', resolves: true },
      failure: { unrest: 1, corruption: 1, text: 'Persecutions continue. +1 Unrest, +1 Corruption.' },
      'critical-failure': { unrest: 2, corruption: 1, strife: 1, text: 'Witch hunts intensify. +2 Unrest, +1 Corruption, +1 Strife.', worsens: true },
    },
  },
  {
    id: 'squatters',
    name: 'Squatters',
    kind: 'continuous',
    description: 'Refugees, vagrants, or political exiles claim abandoned land or buildings without legal right.',
    resolutionSkills: ['politics', 'statecraft'],
    upkeepEffect: { unrest: 1, text: 'Each Upkeep: +1 Unrest until they are removed or legitimised.' },
    outcomes: {
      'critical-success': { fame: 1, text: 'Squatters absorbed peacefully into the populace. +1 Fame.', resolves: true },
      success: { text: 'Squatters relocated peacefully.', resolves: true },
      failure: { unrest: 1, text: 'Squatters dig in. +1 Unrest.' },
      'critical-failure': { unrest: 2, strife: 1, text: 'Riots. +2 Unrest, +1 Strife.', worsens: true },
    },
  },

  // -----------------------------------------------------------
  // One-shot harmful events
  // -----------------------------------------------------------
  {
    id: 'natural-disaster',
    name: 'Natural Disaster',
    kind: 'oneshot',
    description: 'Earthquake, flood, fire, or storm wreaks havoc. The damage is done; can the kingdom recover?',
    resolutionSkills: ['engineering', 'wilderness', 'defense'],
    outcomes: {
      'critical-success': { fame: 1, text: 'Heroic response; relief efforts win the day. +1 Fame.' },
      success: { text: 'Damage minimised by quick action.' },
      failure: { unrest: 2, decay: 1, text: 'Significant damage. +2 Unrest, +1 Decay.' },
      'critical-failure': { unrest: 3, decay: 2, text: 'Catastrophic damage. +3 Unrest, +2 Decay.' },
    },
  },
  {
    id: 'local-disaster',
    name: 'Local Disaster',
    kind: 'oneshot',
    description: 'Fire in a settlement, mine collapse, bridge failure — localised but serious.',
    resolutionSkills: ['engineering', 'defense'],
    outcomes: {
      'critical-success': { fame: 1, text: 'Disaster averted entirely. +1 Fame.' },
      success: { text: 'Damage contained.' },
      failure: { unrest: 1, decay: 1, text: 'Building lost. +1 Unrest, +1 Decay.' },
      'critical-failure': { unrest: 2, decay: 2, text: 'Multiple buildings damaged. +2 Unrest, +2 Decay.' },
    },
  },
  {
    id: 'public-scandal',
    name: 'Public Scandal',
    kind: 'oneshot',
    description: 'A leader\'s indiscretion or a financial irregularity becomes public knowledge.',
    resolutionSkills: ['intrigue', 'politics'],
    outcomes: {
      'critical-success': { fame: 1, text: 'Scandal turned to advantage. +1 Fame.' },
      success: { text: 'Damage limited; scandal fades.' },
      failure: { unrest: 2, corruption: 1, text: 'Public outrage. +2 Unrest, +1 Corruption.' },
      'critical-failure': { unrest: 3, corruption: 2, text: 'Major loss of confidence. +3 Unrest, +2 Corruption.' },
    },
  },
  {
    id: 'sensational-crime',
    name: 'Sensational Crime',
    kind: 'oneshot',
    description: 'A high-profile theft, murder, or kidnapping captivates and disturbs the populace.',
    resolutionSkills: ['intrigue', 'warfare'],
    outcomes: {
      'critical-success': { fame: 1, text: 'Perpetrator brought to justice spectacularly. +1 Fame.' },
      success: { text: 'Crime solved.' },
      failure: { unrest: 1, crime: 1, text: 'Unsolved; unease grows. +1 Unrest, +1 Crime.' },
      'critical-failure': { unrest: 2, crime: 2, text: 'Copycat crimes follow. +2 Unrest, +2 Crime.' },
    },
  },
  {
    id: 'notorious-heist',
    name: 'Notorious Heist',
    kind: 'oneshot',
    description: 'Master thieves target the treasury, a bank, or a noble\'s hoard.',
    resolutionSkills: ['intrigue', 'warfare'],
    outcomes: {
      'critical-success': { fame: 1, rp: 5, text: 'Caught in the act; loot recovered. +1 Fame, +5 RP.' },
      success: { text: 'Heist prevented.' },
      failure: { rp: -5, crime: 1, text: 'Thieves escape with loot. -5 RP, +1 Crime.' },
      'critical-failure': { rp: -10, crime: 2, text: 'Devastating loss. -10 RP, +2 Crime.' },
    },
  },

  // -----------------------------------------------------------
  // Beneficial events
  // -----------------------------------------------------------
  {
    id: 'diplomatic-overture',
    name: 'Diplomatic Overture',
    kind: 'beneficial',
    description: 'A neighbouring power proposes friendly relations or a treaty.',
    resolutionSkills: ['statecraft', 'politics'],
    outcomes: {
      'critical-success': { fame: 2, rp: 5, text: 'Excellent terms negotiated. +2 Fame, +5 RP.' },
      success: { fame: 1, text: 'Treaty signed. +1 Fame.' },
      failure: { text: 'Negotiations stall; no treaty this turn.' },
      'critical-failure': { unrest: 1, text: 'Insulted; relations sour. +1 Unrest.' },
    },
  },
  {
    id: 'visiting-celebrity',
    name: 'Visiting Celebrity',
    kind: 'beneficial',
    description: 'A famous artist, scholar, or hero comes to visit and may grace the kingdom with their patronage.',
    resolutionSkills: ['arts', 'politics', 'scholarship'],
    outcomes: {
      'critical-success': { fame: 2, rp: 3, text: 'Celebrity champions the kingdom. +2 Fame, +3 RP.' },
      success: { fame: 1, text: 'Visit celebrated. +1 Fame.' },
      failure: { text: 'Visit fizzles.' },
      'critical-failure': { unrest: 1, text: 'Celebrity offended publicly. +1 Unrest.' },
    },
  },
  {
    id: 'wedding',
    name: 'Royal Wedding',
    kind: 'beneficial',
    description: 'A noble or royal wedding takes place, drawing crowds and forging political bonds.',
    resolutionSkills: ['politics', 'arts'],
    outcomes: {
      'critical-success': { fame: 2, unrest: -2, text: 'Triumphant celebration. +2 Fame, -2 Unrest.' },
      success: { fame: 1, unrest: -1, text: 'Joyous occasion. +1 Fame, -1 Unrest.' },
      failure: { text: 'Wedding goes off without lasting impact.' },
      'critical-failure': { unrest: 1, strife: 1, text: 'Disastrous social blunder. +1 Unrest, +1 Strife.' },
    },
  },
  {
    id: 'good-weather',
    name: 'Good Weather',
    kind: 'beneficial',
    description: 'Unusually fortuitous weather helps farmers, traders, and travelers.',
    resolutionSkills: [],
    outcomes: {
      'critical-success': { food: 3, text: '+3 Food this turn.' },
      success: { food: 2, text: '+2 Food this turn.' },
      failure: { text: 'No effect.' },
      'critical-failure': { text: 'No effect.' },
    },
    rulesText: 'Apply the success outcome automatically; no check required.',
    manualOutcome: false,
  },

  // -----------------------------------------------------------
  // Stub events (manual outcome)
  // -----------------------------------------------------------
  {
    id: 'vermin-infestation',
    name: 'Vermin Infestation',
    kind: 'continuous',
    description: 'Rats, locusts, or worse infest the kingdom\'s stores.',
    resolutionSkills: ['agriculture', 'wilderness'],
    upkeepEffect: { food: -1, text: 'Each Upkeep: -1 Food until resolved.' },
    manualOutcome: true,
    outcomes: {
      'critical-success': { text: 'Infestation cleared. (Resolve manually.)', resolves: true },
      success: { text: 'Infestation cleared. (Resolve manually.)', resolves: true },
      failure: { text: 'Infestation continues. (Resolve manually.)' },
      'critical-failure': { text: 'Infestation worsens. (Resolve manually.)', worsens: true },
    },
  },
  {
    id: 'land-rush',
    name: 'Land Rush',
    kind: 'beneficial',
    description: 'Settlers flock to claim and cultivate vacant land.',
    resolutionSkills: ['agriculture', 'wilderness', 'politics'],
    manualOutcome: true,
    outcomes: {
      'critical-success': { text: 'Major influx; gain a hex (manual). +1 Fame.', fame: 1 },
      success: { text: 'New settlers absorbed. (Resolve manually.)' },
      failure: { text: 'Few settlers stay.' },
      'critical-failure': { unrest: 1, text: 'Land disputes. +1 Unrest.' },
    },
  },
  {
    id: 'feud',
    name: 'Feud',
    kind: 'continuous',
    description: 'Two noble houses or merchant families enter a public dispute.',
    resolutionSkills: ['politics', 'intrigue'],
    upkeepEffect: { strife: 1, text: 'Each Upkeep: +1 Strife until reconciled.' },
    manualOutcome: true,
    outcomes: {
      'critical-success': { fame: 1, text: 'Reconciled and a treaty struck. +1 Fame.', resolves: true },
      success: { text: 'Feud cooled. (Resolve manually.)', resolves: true },
      failure: { unrest: 1, text: 'Feud continues. +1 Unrest.' },
      'critical-failure': { unrest: 2, strife: 1, text: 'Open street violence. +2 Unrest, +1 Strife.', worsens: true },
    },
  },
];

/** Lookup by id. */
export const EVENT_BY_ID: Record<string, EventEntry> = {};
for (const e of EVENTS) EVENT_BY_ID[e.id] = e;

// =============================================================
// Event instance — an actual event firing on a kingdom
// =============================================================

export type EventStatus =
  | 'active'      // unresolved; needs a resolution check
  | 'resolved'    // successfully dealt with
  | 'failed'      // failed to resolve and event ended unfavourably (one-shot)
  | 'worsened'    // continuous event with a critical failure; DC +2 next time
  | 'dismissed';  // dismissed by GM (no longer tracked)

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Active',
  resolved: 'Resolved',
  failed: 'Failed',
  worsened: 'Worsened',
  dismissed: 'Dismissed',
};

export interface ResolutionAttempt {
  /** Stable id. */
  id: string;
  /** Turn this resolution attempt was made. */
  turn: number;
  /** Skill rolled. */
  skill: KingdomAbility;
  /** d20 result. */
  d20: number;
  /** Modifier applied. */
  modifier: number;
  /** Total = d20 + modifier. */
  total: number;
  /** DC the roll was made against. */
  dc: number;
  /** Outcome tier. */
  outcome: OutcomeTier;
  /** Whether outcome was overridden. */
  overridden: boolean;
  /** Optional GM notes. */
  notes?: string;
}

export interface EventInstance {
  /** Stable id. */
  id: string;
  /** Catalogue entry id. */
  eventId: string;
  /** Turn the event fired. */
  startTurn: number;
  /** Current status. */
  status: EventStatus;
  /** DC modifier (0 normally; +2 if worsened, +4 if worsened twice, etc.). */
  dcModifier: number;
  /** Resolution attempts made on this event. */
  attempts: ResolutionAttempt[];
  /** Free-form GM notes about this specific instance. */
  notes?: string;
}

/** Build a fresh event instance. */
export function makeEventInstance(eventId: string, startTurn: number): EventInstance {
  return {
    id: 'evi_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    eventId,
    startTurn,
    status: 'active',
    dcModifier: 0,
    attempts: [],
  };
}

/** Roll for a random event from the catalogue (uniform distribution). */
export function rollEventTable(rng: () => number = Math.random): EventEntry {
  const i = Math.floor(rng() * EVENTS.length);
  return EVENTS[i];
}
