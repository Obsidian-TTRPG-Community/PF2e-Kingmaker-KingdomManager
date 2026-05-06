// =============================================================
// Activity catalogue — Pathfinder 2e Kingmaker kingdom activities
// =============================================================
// Each entry encodes the rules-text essentials in a structured form so the
// engine can:
//   - filter by current phase
//   - gate by leadership role + invested status
//   - check prerequisites (buildings, hexes, kingdom level, etc.)
//   - propose outcome deltas (RP, ruin, fame, etc.) per success tier
//
// We model the ~25 most-used activities with full mechanics. Every other
// kingdom activity from the AP is listed with id/name/phase/role/skill
// metadata but tagged `manualOutcome: true`, meaning the engine just rolls
// the check and prints the rules-text label — the GM applies the result
// at the table.

import type { Activity, KingdomAbility, LeadershipRole, OutcomeTier, TurnPhase } from './types';

/** What kind of effect an activity outcome can apply automatically. */
export interface OutcomeDelta {
  /** Resource changes. Positive = gain, negative = spend. */
  rp?: number;
  food?: number;
  lumber?: number;
  luxuries?: number;
  ore?: number;
  stone?: number;
  /** Status changes. */
  unrest?: number;
  fame?: number;
  /** Ruin changes by track. */
  corruption?: number;
  crime?: number;
  decay?: number;
  strife?: number;
  /** XP gained. */
  xp?: number;
  /** Free-text effect description shown in the dialog. */
  text?: string;
}

/** Per-tier outcome bundle for a single activity. */
export interface ActivityOutcomes {
  'critical-success': OutcomeDelta;
  success: OutcomeDelta;
  failure: OutcomeDelta;
  'critical-failure': OutcomeDelta;
}

/** Prerequisites that gate whether an activity is even legal to attempt. */
export interface ActivityPrereq {
  /** A building id from buildings.ts that must exist somewhere in the kingdom. */
  buildingId?: string;
  /** Minimum kingdom level. */
  minKingdomLevel?: number;
  /** Free-text prerequisite for activities we don't fully gate (e.g. "must have an army"). */
  text?: string;
}

/** Catalogue entry. */
export interface ActivityEntry {
  id: Activity;
  name: string;
  phase: TurnPhase;
  /** Which leader role is required to take this activity, if any. */
  role?: LeadershipRole;
  /** Which kingdom ability/skill is rolled. */
  skill: KingdomAbility;
  /** Short rules-text description. Shown in the activity card. */
  description: string;
  /** Prerequisites to even appear in the legal-activity list. */
  prereqs?: ActivityPrereq[];
  /** Outcome deltas. If omitted, manualOutcome must be true. */
  outcomes?: ActivityOutcomes;
  /**
   * If true, the engine doesn't try to auto-apply outcome deltas — it just
   * rolls and shows the rules text; GM resolves at the table.
   */
  manualOutcome?: boolean;
  /** Whether this activity counts against the Leadership-activity slot cap. */
  consumesLeadershipSlot?: boolean;
  /**
   * If set, the activity counts as one of this leader role's once-per-phase
   * picks (used for Commerce + Region phases where each leader gets one).
   */
  consumesLeaderPhaseSlot?: boolean;
  /** Activity-bonus key matching the buildings.ts itemBonus.activity values. */
  itemBonusKey?: Activity;
}

// =============================================================
// Catalogue
// =============================================================
// Ordered roughly by phase. Within each phase, by role.

export const ACTIVITIES: ActivityEntry[] = [
  // ------------------------------------------------------------
  // UPKEEP phase
  // ------------------------------------------------------------
  {
    id: 'pay-consumption',
    name: 'Pay Consumption',
    phase: 'upkeep',
    skill: 'industry', // not actually rolled but we keep a field for shape
    description:
      "Spend Food equal to your Consumption. If insufficient, spend 5 RP per missing Food, or gain 1 Unrest per missing Food.",
    manualOutcome: true,
  },
  {
    id: 'quell-unrest-arts',
    name: 'Quell Unrest (Arts)',
    phase: 'upkeep',
    skill: 'arts',
    description:
      "Distract the populace with art. Reduce Unrest on success.",
    outcomes: {
      'critical-success': { unrest: -2, fame: 1, text: 'The kingdom rallies; reduce Unrest by 2 and gain 1 Fame.' },
      success: { unrest: -1, text: 'Reduce Unrest by 1.' },
      failure: { text: 'No effect.' },
      'critical-failure': { unrest: 1, text: 'A heckler turns the crowd; gain 1 Unrest.' },
    },
    itemBonusKey: 'quell-unrest-arts',
  },
  {
    id: 'quell-unrest-folklore',
    name: 'Quell Unrest (Folklore)',
    phase: 'upkeep',
    skill: 'folklore',
    description:
      "Use folklore + ritual to soothe tensions. Reduce Unrest on success.",
    outcomes: {
      'critical-success': { unrest: -2, fame: 1, text: 'A meaningful ritual; reduce Unrest by 2 and gain 1 Fame.' },
      success: { unrest: -1, text: 'Reduce Unrest by 1.' },
      failure: { text: 'No effect.' },
      'critical-failure': { unrest: 1, text: 'Ritual mishandled; gain 1 Unrest.' },
    },
    itemBonusKey: 'quell-unrest-folklore',
  },
  {
    id: 'quell-unrest-intrigue',
    name: 'Quell Unrest (Intrigue)',
    phase: 'upkeep',
    skill: 'intrigue',
    description: "Suppress dissent through intrigue and surveillance.",
    outcomes: {
      'critical-success': { unrest: -2, crime: 1, text: 'Quiet enforcement reduces Unrest by 2; +1 Crime.' },
      success: { unrest: -1, text: 'Reduce Unrest by 1.' },
      failure: { text: 'No effect.' },
      'critical-failure': { unrest: 1, crime: 1, text: 'Cover-up exposed; +1 Unrest, +1 Crime.' },
    },
    itemBonusKey: 'quell-unrest-intrigue',
  },
  {
    id: 'quell-unrest-magic',
    name: 'Quell Unrest (Magic)',
    phase: 'upkeep',
    skill: 'magic',
    description: "Magical arts soothe or distract the populace.",
    outcomes: {
      'critical-success': { unrest: -2, fame: 1, text: 'A wonder displayed; reduce Unrest by 2 and gain 1 Fame.' },
      success: { unrest: -1, text: 'Reduce Unrest by 1.' },
      failure: { text: 'No effect.' },
      'critical-failure': { unrest: 1, text: 'A magical mishap; gain 1 Unrest.' },
    },
    itemBonusKey: 'quell-unrest-magic',
  },
  {
    id: 'quell-unrest-politics',
    name: 'Quell Unrest (Politics)',
    phase: 'upkeep',
    skill: 'politics',
    description: "Address the citizenry directly.",
    outcomes: {
      'critical-success': { unrest: -2, fame: 1, text: 'Stirring address; reduce Unrest by 2 and gain 1 Fame.' },
      success: { unrest: -1, text: 'Reduce Unrest by 1.' },
      failure: { text: 'No effect.' },
      'critical-failure': { unrest: 1, text: 'Tone-deaf appeal; gain 1 Unrest.' },
    },
    itemBonusKey: 'quell-unrest-politics',
  },
  {
    id: 'quell-unrest-warfare',
    name: 'Quell Unrest (Warfare)',
    phase: 'upkeep',
    skill: 'warfare',
    description: "Show of military force discourages dissent.",
    outcomes: {
      'critical-success': { unrest: -2, strife: 1, text: 'A disciplined parade; reduce Unrest by 2; +1 Strife.' },
      success: { unrest: -1, text: 'Reduce Unrest by 1.' },
      failure: { text: 'No effect.' },
      'critical-failure': { unrest: 2, strife: 1, text: 'Heavy-handed; gain 2 Unrest and +1 Strife.' },
    },
    itemBonusKey: 'quell-unrest-warfare',
  },

  // ------------------------------------------------------------
  // COMMERCE phase
  // ------------------------------------------------------------
  {
    id: 'collect-taxes',
    name: 'Collect Taxes',
    phase: 'commerce',
    role: 'treasurer',
    skill: 'trade',
    description:
      "Demand RP from your population. Higher results gain more RP but also more Unrest if pushed too hard.",
    outcomes: {
      'critical-success': { rp: 4, text: 'Coffers swell; gain 4 RP.' },
      success: { rp: 2, text: 'Gain 2 RP.' },
      failure: { rp: 1, unrest: 1, text: 'Modest take; gain 1 RP and 1 Unrest from grumbling.' },
      'critical-failure': { unrest: 2, corruption: 1, text: 'Disastrous collection; +2 Unrest, +1 Corruption.' },
    },
    consumesLeaderPhaseSlot: true,
    itemBonusKey: 'collect-taxes',
  },
  {
    id: 'capital-investment',
    name: 'Capital Investment',
    phase: 'commerce',
    role: 'treasurer',
    skill: 'trade',
    description:
      "Invest 10 RP into the local economy via a bank, with returns dependent on the result.",
    prereqs: [{ buildingId: 'bank', text: 'Requires a Bank somewhere in the kingdom.' }],
    outcomes: {
      'critical-success': { rp: 10, text: 'Investment doubles; net +10 RP next turn.' },
      success: { rp: 5, text: 'Returns + 5 RP next turn.' },
      failure: { rp: -5, text: 'Disappointing; lose 5 RP.' },
      'critical-failure': { rp: -10, corruption: 1, text: 'Embezzlement; lose 10 RP, +1 Corruption.' },
    },
    consumesLeaderPhaseSlot: true,
    itemBonusKey: 'capital-investment',
  },
  {
    id: 'tap-treasury',
    name: 'Tap Treasury',
    phase: 'commerce',
    role: 'treasurer',
    skill: 'trade',
    description:
      "Liquidate kingdom assets for emergency RP. Gain RP at the cost of Unrest and a temporary skill penalty.",
    outcomes: {
      'critical-success': { rp: 6, unrest: 1, text: 'Lean tap; gain 6 RP and only 1 Unrest.' },
      success: { rp: 4, unrest: 1, text: 'Gain 4 RP and 1 Unrest.' },
      failure: { rp: 2, unrest: 2, text: 'Wasteful; gain 2 RP and 2 Unrest.' },
      'critical-failure': { unrest: 3, decay: 1, text: 'Treasury looted; +3 Unrest and +1 Decay.' },
    },
    consumesLeaderPhaseSlot: true,
  },
  {
    id: 'establish-trade-agreement',
    name: 'Establish Trade Agreement',
    phase: 'commerce',
    role: 'counselor',
    skill: 'trade',
    description:
      "Open a trade route with a neighbouring nation. Provides ongoing RP each turn.",
    prereqs: [{ text: 'Requires a friendly trade partner; GM-determined.' }],
    outcomes: {
      'critical-success': { fame: 1, text: 'Excellent terms; +1 RP/turn ongoing and +1 Fame.' },
      success: { text: 'Trade established; +1 RP/turn ongoing.' },
      failure: { text: 'Negotiations stall; no agreement this turn.' },
      'critical-failure': { unrest: 1, text: 'Insulted the partner; +1 Unrest, no agreement.' },
    },
    consumesLeaderPhaseSlot: true,
    itemBonusKey: 'establish-trade-agreement',
  },
  {
    id: 'manage-trade-agreements',
    name: 'Manage Trade Agreements',
    phase: 'commerce',
    role: 'counselor',
    skill: 'trade',
    description: "Keep existing trade routes profitable.",
    outcomes: {
      'critical-success': { rp: 3, text: 'Routes thrive; +3 RP this turn.' },
      success: { rp: 2, text: '+2 RP this turn.' },
      failure: { text: 'Status quo; no extra RP.' },
      'critical-failure': { rp: -2, text: 'Routes disrupted; lose 2 RP.' },
    },
    consumesLeaderPhaseSlot: true,
    itemBonusKey: 'manage-trade-agreements',
  },
  {
    id: 'improve-lifestyle',
    name: 'Improve Lifestyle',
    phase: 'commerce',
    role: 'ruler',
    skill: 'politics',
    description:
      "Use the kingdom's wealth to improve PCs' personal upkeep. RP cost; PCs gain a benefit.",
    outcomes: {
      'critical-success': { rp: -2, text: 'Lavish quarters; spend 2 RP, PCs treat lifestyle as one tier higher this turn.' },
      success: { rp: -2, text: 'Spend 2 RP; PCs upkeep covered this turn.' },
      failure: { rp: -2, text: 'Wasted spend; 2 RP gone, no benefit.' },
      'critical-failure': { rp: -3, unrest: 1, text: 'Public outrage at extravagance; lose 3 RP and gain 1 Unrest.' },
    },
    consumesLeaderPhaseSlot: true,
    itemBonusKey: 'improve-lifestyle',
  },
  {
    id: 'trade-commodities',
    name: 'Trade Commodities',
    phase: 'commerce',
    role: 'treasurer',
    skill: 'trade',
    description:
      "Convert one commodity to another at market. Result determines exchange rate.",
    outcomes: {
      'critical-success': { text: 'Excellent rate; trade 1 unit for 2 of another commodity.' },
      success: { text: 'Even trade; 1-for-1.' },
      failure: { text: 'Poor rate; 2 units for 1.' },
      'critical-failure': { text: 'Swindled; 2 units lost for nothing.' },
    },
    consumesLeaderPhaseSlot: true,
    manualOutcome: true,
    itemBonusKey: 'trade-commodities',
  },

  // ------------------------------------------------------------
  // LEADERSHIP phase (most diverse — many activities here)
  // ------------------------------------------------------------
  {
    id: 'new-leadership',
    name: 'New Leadership',
    phase: 'leadership',
    role: 'ruler',
    skill: 'politics',
    description:
      "Reshuffle leadership roles. Used when a leader changes (PC dies, retires, swaps role, etc.). Ruler attempts on behalf of the kingdom.",
    outcomes: {
      'critical-success': { unrest: -1, fame: 1, text: 'Smooth transition; -1 Unrest and +1 Fame.' },
      success: { text: 'Roles re-assigned cleanly.' },
      failure: { unrest: 1, text: 'Some friction; +1 Unrest.' },
      'critical-failure': { unrest: 2, strife: 1, text: 'Public discontent; +2 Unrest and +1 Strife.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'new-leadership',
  },
  {
    id: 'pledge-of-fealty-statecraft',
    name: 'Pledge of Fealty (Statecraft)',
    phase: 'leadership',
    role: 'ruler',
    skill: 'statecraft',
    description:
      "Diplomatic offer to a free entity (tribe, settlement, freeholder) to join your kingdom.",
    outcomes: {
      'critical-success': { fame: 1, xp: 80, text: 'They join enthusiastically; +1 Fame, +80 XP, gain a hex or asset (GM).' },
      success: { xp: 40, text: 'They join your kingdom; +40 XP.' },
      failure: { text: 'No deal this season.' },
      'critical-failure': { unrest: 1, text: 'Insulted; +1 Unrest, prospective partner becomes hostile.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'pledge-of-fealty-statecraft',
  },
  {
    id: 'pledge-of-fealty-warfare',
    name: 'Pledge of Fealty (Warfare)',
    phase: 'leadership',
    role: 'ruler',
    skill: 'warfare',
    description:
      "Coerce a hostile or neutral group to swear fealty under threat of force.",
    outcomes: {
      'critical-success': { xp: 80, strife: 1, text: 'They submit; +80 XP, +1 Strife.' },
      success: { xp: 40, strife: 1, text: 'Reluctant submission; +40 XP, +1 Strife.' },
      failure: { unrest: 1, text: 'They resist; +1 Unrest.' },
      'critical-failure': { unrest: 2, strife: 2, text: 'They go to war; +2 Unrest, +2 Strife.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'pledge-of-fealty-warfare',
  },
  {
    id: 'send-diplomatic-envoy',
    name: 'Send Diplomatic Envoy',
    phase: 'leadership',
    role: 'emissary',
    skill: 'statecraft',
    description: "Establish formal diplomatic relations with another kingdom.",
    outcomes: {
      'critical-success': { fame: 1, text: 'Excellent rapport; +1 Fame and 2-step relationship improvement.' },
      success: { text: '1-step relationship improvement.' },
      failure: { text: 'No change in relations.' },
      'critical-failure': { unrest: 1, text: 'Diplomatic incident; +1 Unrest, relationship sours.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'send-diplomatic-envoy',
  },
  {
    id: 'request-foreign-aid',
    name: 'Request Foreign Aid',
    phase: 'leadership',
    role: 'emissary',
    skill: 'statecraft',
    description: "Ask an allied kingdom for resources in a time of need.",
    outcomes: {
      'critical-success': { rp: 10, text: 'Generous aid; gain 10 RP.' },
      success: { rp: 5, text: '+5 RP.' },
      failure: { text: 'Politely declined.' },
      'critical-failure': { unrest: 1, text: 'Embarrassed; +1 Unrest.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'request-foreign-aid',
  },
  {
    id: 'celebrate-holiday',
    name: 'Celebrate Holiday',
    phase: 'leadership',
    role: 'counselor',
    skill: 'folklore',
    description: "Declare a kingdom-wide holiday to lift spirits.",
    outcomes: {
      'critical-success': { unrest: -2, fame: 1, text: 'Joyous; -2 Unrest, +1 Fame.' },
      success: { unrest: -1, text: '-1 Unrest.' },
      failure: { rp: -1, text: 'Underwhelming; lose 1 RP.' },
      'critical-failure': { unrest: 1, decay: 1, text: 'Riotous; +1 Unrest, +1 Decay.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'celebrate-holiday',
  },
  {
    id: 'creative-solution',
    name: 'Creative Solution',
    phase: 'leadership',
    role: 'magister',
    skill: 'scholarship',
    description:
      "Devote scholarly effort to solving a problem. On success, gain a +2 status bonus to one check before the end of next turn.",
    outcomes: {
      'critical-success': { text: '+4 status bonus to one check before end of next turn (logged manually).' },
      success: { text: '+2 status bonus to one check before end of next turn (logged manually).' },
      failure: { text: 'No insight gained.' },
      'critical-failure': { unrest: 1, text: 'Scandalous theory; +1 Unrest.' },
    },
    consumesLeadershipSlot: true,
    manualOutcome: false,
    itemBonusKey: 'creative-solution',
  },
  {
    id: 'supernatural-solution',
    name: 'Supernatural Solution',
    phase: 'leadership',
    role: 'magister',
    skill: 'magic',
    description:
      "Use magical means to solve a problem. On success, gain a status bonus to a future check.",
    outcomes: {
      'critical-success': { text: '+4 status bonus to one check before end of next turn (logged manually).' },
      success: { text: '+2 status bonus to one check before end of next turn (logged manually).' },
      failure: { text: 'No effect.' },
      'critical-failure': { unrest: 1, text: 'Magical backlash; +1 Unrest.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'supernatural-solution',
  },
  {
    id: 'recruit-army',
    name: 'Recruit Army',
    phase: 'leadership',
    role: 'general',
    skill: 'warfare',
    description:
      "Raise a new army unit. On Success, a new infantry army is added to your roster at your kingdom's level. Edit its name, type, and stats afterwards in the kingdom-armies block.",
    outcomes: {
      'critical-success': { xp: 40, text: 'New army raised in elite condition (Efficient).' },
      success: { text: 'New army raised at standard condition.' },
      failure: { text: 'Recruitment falls short; no army raised.' },
      'critical-failure': { unrest: 1, strife: 1, text: 'Conscription riots; +1 Unrest, +1 Strife. No army raised.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'recruit-army',
  },
  {
    id: 'train-army',
    name: 'Train Army',
    phase: 'leadership',
    role: 'general',
    skill: 'warfare',
    description: "Drill an existing army to improve its level.",
    outcomes: {
      'critical-success': { text: 'Army gains 2 levels (capped at kingdom level; manual).' },
      success: { text: 'Army gains 1 level (manual).' },
      failure: { text: 'No improvement this turn.' },
      'critical-failure': { unrest: 1, text: 'Training accident; +1 Unrest.' },
    },
    consumesLeadershipSlot: true,
    manualOutcome: true,
    itemBonusKey: 'train-army',
  },
  {
    id: 'garrison-army',
    name: 'Garrison Army',
    phase: 'leadership',
    role: 'general',
    skill: 'warfare',
    description: "Station an army to defend a settlement or hex.",
    manualOutcome: true,
    consumesLeadershipSlot: true,
    itemBonusKey: 'garrison-army',
    outcomes: {
      'critical-success': { text: 'Army garrisons effectively (manual).' },
      success: { text: 'Army garrisons (manual).' },
      failure: { text: 'Garrison takes effect next turn (manual).' },
      'critical-failure': { strife: 1, text: '+1 Strife from heavy-handed posting.' },
    },
  },
  {
    id: 'recover-army',
    name: 'Recover Army',
    phase: 'leadership',
    role: 'general',
    skill: 'warfare',
    description: "Restore HP and morale to a damaged army.",
    manualOutcome: true,
    consumesLeadershipSlot: true,
    itemBonusKey: 'recover-army',
    outcomes: {
      'critical-success': { text: 'Army fully restored (manual).' },
      success: { text: 'Army recovers significantly (manual).' },
      failure: { text: 'Marginal recovery (manual).' },
      'critical-failure': { unrest: 1, text: 'Mutiny; +1 Unrest.' },
    },
  },
  {
    id: 'prognostication',
    name: 'Prognostication',
    phase: 'leadership',
    role: 'magister',
    skill: 'magic',
    description: "Divine the kingdom's near future to gain insight on the next event.",
    outcomes: {
      'critical-success': { text: 'Roll twice on next event; pick result.' },
      success: { text: '+2 to next event resolution roll.' },
      failure: { text: 'Vision unclear.' },
      'critical-failure': { unrest: 1, text: 'Bad omens spread; +1 Unrest.' },
    },
    consumesLeadershipSlot: true,
    manualOutcome: true,
    itemBonusKey: 'prognostication',
  },
  {
    id: 'clandestine-business',
    name: 'Clandestine Business',
    phase: 'leadership',
    role: 'royal-enforcer',
    skill: 'intrigue',
    description: "Run black-market operations and informants to gain RP.",
    outcomes: {
      'critical-success': { rp: 4, crime: 1, text: '+4 RP, +1 Crime.' },
      success: { rp: 2, crime: 1, text: '+2 RP, +1 Crime.' },
      failure: { crime: 1, text: '+1 Crime, no RP.' },
      'critical-failure': { unrest: 1, crime: 2, text: '+1 Unrest, +2 Crime.' },
    },
    consumesLeadershipSlot: true,
    itemBonusKey: 'clandestine-business',
  },
  {
    id: 'infiltration',
    name: 'Infiltration',
    phase: 'leadership',
    role: 'royal-enforcer',
    skill: 'intrigue',
    description: "Spy on a rival or threat to gain intelligence.",
    outcomes: {
      'critical-success': { fame: 1, text: 'Excellent intel; +1 Fame and detailed knowledge of the target.' },
      success: { text: 'Useful intel obtained.' },
      failure: { text: 'Intel inconclusive.' },
      'critical-failure': { unrest: 1, crime: 1, text: 'Spy captured; +1 Unrest, +1 Crime, possible diplomatic incident.' },
    },
    consumesLeadershipSlot: true,
    manualOutcome: true,
    itemBonusKey: 'infiltration',
  },
  {
    id: 'hire-adventurers',
    name: 'Hire Adventurers',
    phase: 'leadership',
    role: 'ruler',
    skill: 'exploration', // not a real ability
    description:
      "Hire freelance heroes to handle a problem. (PF2e doesn't have an Exploration kingdom skill — see notes; usually rolled with a relevant skill, GM's call.)",
    outcomes: {
      'critical-success': { rp: -2, text: 'Spend 2 RP; problem solved + bonus benefit (manual).' },
      success: { rp: -2, text: 'Spend 2 RP; problem solved (manual).' },
      failure: { rp: -2, text: 'Spend 2 RP; problem persists.' },
      'critical-failure': { rp: -4, unrest: 1, text: 'Spend 4 RP; problem worse, +1 Unrest.' },
    },
    consumesLeadershipSlot: true,
    manualOutcome: true,
    itemBonusKey: 'hire-adventurers',
  },

  // ------------------------------------------------------------
  // REGION (Civic) phase — hex / settlement work
  // ------------------------------------------------------------
  {
    id: 'claim-hex',
    name: 'Claim Hex',
    phase: 'civic',
    role: 'ruler',
    skill: 'exploration',
    description:
      "Formally claim an explored hex adjacent to your kingdom. Increases Size; affects Control DC.",
    outcomes: {
      'critical-success': { xp: 20, text: 'Claim hex; +20 XP and reduce one Ruin by 1 (manual choice).' },
      success: { xp: 10, text: 'Claim hex; +10 XP.' },
      failure: { text: 'Claim fails this turn.' },
      'critical-failure': { unrest: 1, text: 'Resistance to claim; +1 Unrest.' },
    },
    manualOutcome: true,
  },
  {
    id: 'establish-work-site',
    name: 'Establish Work Site',
    phase: 'civic',
    role: 'general',
    skill: 'engineering',
    description:
      "Build a Lumber Camp / Mine / Quarry / Farmland on an appropriate-terrain hex.",
    outcomes: {
      'critical-success': { text: 'Work site established immediately; gain 1 commodity from it this turn.' },
      success: { text: 'Work site established.' },
      failure: { text: 'Site fails; can re-attempt next turn.' },
      'critical-failure': { unrest: 1, text: 'Workers killed in construction; +1 Unrest.' },
    },
    manualOutcome: true,
    itemBonusKey: 'establish-work-site',
  },
  {
    id: 'build-roads',
    name: 'Build Roads',
    phase: 'civic',
    role: 'general',
    skill: 'engineering',
    description: "Build a road on an edge between two claimed hexes.",
    outcomes: {
      'critical-success': { text: 'Excellent roads; +2 hex edges roaded.' },
      success: { text: '+1 hex edge roaded.' },
      failure: { text: 'No progress this turn.' },
      'critical-failure': { decay: 1, text: 'Wasted effort; +1 Decay.' },
    },
    manualOutcome: true,
    itemBonusKey: 'build-roads',
  },
  {
    id: 'build-structure',
    name: 'Build Structure',
    phase: 'civic',
    role: 'counselor',
    skill: 'industry',
    description:
      "Construct a building on a settlement lot. Costs RP + commodities per the building's stats.",
    outcomes: {
      'critical-success': { text: 'Building constructed at half RP cost.' },
      success: { text: 'Building constructed at full cost.' },
      failure: { text: 'Construction stalls; no building this turn.' },
      'critical-failure': { unrest: 1, decay: 1, text: 'Disastrous; +1 Unrest, +1 Decay, building reverts to Rubble.' },
    },
    manualOutcome: true,
    itemBonusKey: 'build-structure',
  },
  {
    id: 'demolish',
    name: 'Demolish',
    phase: 'civic',
    role: 'counselor',
    skill: 'engineering',
    description: "Tear down an existing structure to free a lot.",
    outcomes: {
      'critical-success': { text: 'Cleanly demolished; lot now free.' },
      success: { text: 'Demolished, with normal effort.' },
      failure: { text: 'Half-demolished; complete next turn.' },
      'critical-failure': { unrest: 1, decay: 1, text: 'Disaster; +1 Unrest, +1 Decay, lot becomes Rubble.' },
    },
    manualOutcome: true,
    itemBonusKey: 'demolish',
  },
];

/** Quick lookup by id. */
export const ACTIVITY_BY_ID: Record<string, ActivityEntry> = {};
for (const a of ACTIVITIES) ACTIVITY_BY_ID[a.id] = a;
