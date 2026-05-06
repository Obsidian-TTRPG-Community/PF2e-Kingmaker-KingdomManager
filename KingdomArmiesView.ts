// =============================================================
// Kingdom feat catalogue
// =============================================================
// Pathfinder 2e Kingmaker AP — kingdom feats.
//
// Three flavours:
//   - heartland: picked once at level 1, based on terrain
//   - government: picked once at level 3, based on government type
//   - general: picked at level 2, 4, 6, 8, ... (every even level)
//
// Each feat has rules-text describing its mechanical effect. We catalogue
// the feat data (id, name, level, type, prereq text, description) so the
// level-up wizard can offer a picker, but we DO NOT implement mechanical
// hooks. When a feat's effect fires during play, the GM adjudicates at the
// table — same half-auto philosophy as activities, events, and army tactics.
//
// Catalogue is best-effort from the AP appendix. Some level prerequisites
// or specific wordings may diverge from a particular printing.

import type { KingdomAbility } from './types';

export type FeatType = 'heartland' | 'government' | 'general';

export const FEAT_TYPE_LABELS: Record<FeatType, string> = {
  heartland: 'Heartland',
  government: 'Government',
  general: 'General',
};

export interface FeatEntry {
  id: string;
  name: string;
  type: FeatType;
  /** Minimum kingdom level required (1 for heartland, 3 for government, 2/4/6/etc for general). */
  level: number;
  /**
   * For heartland and government feats: the heartland or government value
   * required (matched case-insensitively against KingdomState.heartland or
   * KingdomState.government). Empty/undefined = no restriction.
   */
  requires?: string;
  /** Free-text prerequisite (proficiency rank, other feats, etc.). Surfaced as a hint. */
  prereqText?: string;
  /** Short rules-text description shown in the picker and on the kingdom sheet. */
  description: string;
}

// =============================================================
// Heartland feats (level 1)
// =============================================================

export const HEARTLAND_FEATS: FeatEntry[] = [
  {
    id: 'forest-stewardship',
    name: 'Forest Stewardship',
    type: 'heartland',
    level: 1,
    requires: 'forest',
    description: 'Your kingdom lives in close harmony with its woodlands. Gain a +2 circumstance bonus to Wilderness checks made in forest hexes, and Lumber Camps in forest hexes produce +1 Lumber per turn.',
  },
  {
    id: 'plains-settler',
    name: 'Plains Settler',
    type: 'heartland',
    level: 1,
    requires: 'plains',
    description: 'Your people are at home on the open plains. Gain a +2 circumstance bonus to Agriculture checks involving plains hexes, and Farmlands in plains hexes produce +1 Food per turn.',
  },
  {
    id: 'mountain-stronghold',
    name: 'Mountain Stronghold',
    type: 'heartland',
    level: 1,
    requires: 'mountain',
    description: 'Your people thrive among peaks and crags. Gain a +2 circumstance bonus to Engineering and Defense checks in mountain hexes; Mines in mountain hexes produce +1 Ore per turn.',
  },
  {
    id: 'swamp-dwellers',
    name: 'Swamp Dwellers',
    type: 'heartland',
    level: 1,
    requires: 'swamp',
    description: 'Your people have learned to thrive in marshes others avoid. Gain a +2 circumstance bonus to Wilderness checks in swamp hexes, and reduce the Consumption cost of swamp settlements by 1.',
  },
  {
    id: 'hills-folk',
    name: 'Hills Folk',
    type: 'heartland',
    level: 1,
    requires: 'hills',
    description: 'Sturdy hill country shapes a sturdy people. Gain a +2 circumstance bonus to Industry checks in hills hexes, and your kingdom\'s Defense ability score is treated as 1 higher.',
  },
  {
    id: 'lakelander',
    name: 'Lakelander',
    type: 'heartland',
    level: 1,
    requires: 'lake',
    description: 'Your kingdom lies upon a great lake. Gain a +2 circumstance bonus to Boating checks, and water-bordered settlements gain +1 Food capacity.',
  },
  {
    id: 'coastal-people',
    name: 'Coastal People',
    type: 'heartland',
    level: 1,
    requires: 'coast',
    description: 'Your kingdom has access to the sea. Gain a +2 circumstance bonus to Trade checks involving foreign trade, and coastal settlements gain access to +1 luxury commodity per turn.',
  },
  {
    id: 'desert-wanderers',
    name: 'Desert Wanderers',
    type: 'heartland',
    level: 1,
    requires: 'desert',
    description: 'Your people endure the harsh sands. Gain a +2 circumstance bonus to Exploration checks in desert hexes, and your kingdom resists Crop Failure events at +2 to the resolution check.',
  },
];

// =============================================================
// Government feats (level 3)
// =============================================================

export const GOVERNMENT_FEATS: FeatEntry[] = [
  {
    id: 'crush-dissent',
    name: 'Crush Dissent',
    type: 'government',
    level: 3,
    requires: 'despotism',
    description: 'Once per turn when an event would add Unrest, attempt a Warfare check vs Control DC; on a success, reduce the gained Unrest by 1 (or 2 on a critical success). Crime increases by 1 instead.',
  },
  {
    id: 'inspiring-pageantry',
    name: 'Inspiring Pageantry',
    type: 'government',
    level: 3,
    requires: 'republic',
    description: 'During the Commerce phase, you can make an Arts check vs Control DC to host a public ceremony. On a success, gain 1 Fame and reduce Unrest by 1.',
  },
  {
    id: 'noble-network',
    name: 'Noble Network',
    type: 'government',
    level: 3,
    requires: 'feudalism',
    description: 'Your noble allies provide intelligence and support. Once per turn, gain a +2 circumstance bonus to a Statecraft or Intrigue check. The benefit increases to +3 above kingdom level 10.',
  },
  {
    id: 'divine-mandate',
    name: 'Divine Mandate',
    type: 'government',
    level: 3,
    requires: 'theocracy',
    description: 'Your kingdom\'s rule is sanctified. Once per turn, you can roll twice and take the higher result on a Folklore or Magic check. On a critical success, gain 1 Fame.',
  },
  {
    id: 'shadow-government',
    name: 'Shadow Government',
    type: 'government',
    level: 3,
    requires: 'secret-syndicate',
    description: 'Your true rulers act behind the scenes. Once per turn, attempt an Intrigue check vs Control DC; on a success, an enemy diplomatic, criminal, or political event is delayed by one turn.',
  },
  {
    id: 'open-floor',
    name: 'Open Floor',
    type: 'government',
    level: 3,
    requires: 'yeomanry',
    description: 'Your people decide together. Once per turn, all leaders gain a +1 circumstance bonus to checks during the Leadership phase. If three or more leaders are invested, increase to +2.',
  },
  {
    id: 'collective-vision',
    name: 'Collective Vision',
    type: 'government',
    level: 3,
    requires: 'oligarchy',
    description: 'Your council of magnates pools knowledge. Once per turn during the Commerce phase, choose one ability score; treat that ability as 2 higher for that phase\'s checks.',
  },
];

// =============================================================
// General kingdom feats (level 2 onward, every 2 levels)
// =============================================================

export const GENERAL_FEATS: FeatEntry[] = [
  // Level 2
  {
    id: 'civil-service',
    name: 'Civil Service',
    type: 'general',
    level: 2,
    description: 'Bureaucracy makes the kingdom run smoothly. Reduce all Resource Point costs by 1 (minimum 0) when constructing buildings.',
  },
  {
    id: 'eager-citizens',
    name: 'Eager Citizens',
    type: 'general',
    level: 2,
    description: 'Your citizens want their kingdom to thrive. Gain a +1 circumstance bonus to Quell Unrest checks; the bonus increases to +2 if your Unrest is 5 or higher.',
  },
  {
    id: 'practiced-cartographers',
    name: 'Practiced Cartographers',
    type: 'general',
    level: 2,
    description: 'Your scouts map the wilderness with precision. Gain a +1 circumstance bonus to Exploration checks. Hexes claimed via Claim Hex grant +1 XP on a critical success.',
  },
  {
    id: 'frontier-justice',
    name: 'Frontier Justice',
    type: 'general',
    level: 2,
    description: 'Justice is swift on the frontier. Crime ruin gains 1 less per turn; once per turn, when an event would add Crime, you may reduce the gain by 1.',
  },
  {
    id: 'stalwart-defenders',
    name: 'Stalwart Defenders',
    type: 'general',
    level: 2,
    description: 'Your kingdom\'s armies hold their ground. Gain a +1 circumstance bonus to Defense and Warfare checks made in defensive battles.',
  },

  // Level 4
  {
    id: 'cooperative-leadership',
    name: 'Cooperative Leadership',
    type: 'general',
    level: 4,
    description: 'Your leaders work in concert. Once per turn during the Leadership phase, one leader can use another leader\'s ability modifier in place of their own.',
  },
  {
    id: 'expert-balance',
    name: 'Expert Balance',
    type: 'general',
    level: 4,
    description: 'You\'ve mastered the art of running a kingdom. Choose one ability score; gain a +1 status bonus to checks using that ability. You can change the choice during a level-up.',
  },
  {
    id: 'fortified-frontiers',
    name: 'Fortified Frontiers',
    type: 'general',
    level: 4,
    description: 'Your borderlands are well-defended. Watchtowers and similar structures grant +1 to Defense checks for the entire kingdom (not just their hex).',
  },
  {
    id: 'grand-bazaar',
    name: 'Grand Bazaar',
    type: 'general',
    level: 4,
    description: 'Trade comes naturally to your people. The first Trade Commodities activity each turn always succeeds (treat it as a Success unless rolled higher).',
  },
  {
    id: 'merchants-charter',
    name: "Merchant's Charter",
    type: 'general',
    level: 4,
    description: 'Your merchant class flourishes. Trade Agreements you establish are 1 step better in their relationship outcome.',
  },

  // Level 6
  {
    id: 'border-friendship',
    name: 'Border Friendship',
    type: 'general',
    level: 6,
    description: 'Your neighbors are allies, not threats. Gain a +1 circumstance bonus to Statecraft checks against bordering kingdoms; if you\'ve established Trade Agreements with three or more, the bonus is +2.',
  },
  {
    id: 'cultural-exchange',
    name: 'Cultural Exchange',
    type: 'general',
    level: 6,
    description: 'Your kingdom embraces different peoples. Diplomatic Overture and Visiting Celebrity events are resolved at +2 to the check; a critical success grants 2 Fame.',
  },
  {
    id: 'feast-or-famine',
    name: 'Feast or Famine',
    type: 'general',
    level: 6,
    description: 'Your people prepare for lean times. Increase your Food storage capacity by 5; once per turn during Upkeep, you may convert 2 Food to 1 RP.',
  },
  {
    id: 'iron-discipline',
    name: 'Iron Discipline',
    type: 'general',
    level: 6,
    description: 'Your armies and citizens alike are disciplined. Reduce the Consumption cost of all armies by 1 (minimum 0).',
  },
  {
    id: 'public-works',
    name: 'Public Works',
    type: 'general',
    level: 6,
    description: 'Your kingdom invests heavily in infrastructure. Build Roads activities cost 1 fewer Lumber and Stone (minimum 0).',
  },

  // Level 8
  {
    id: 'inspired-leadership',
    name: 'Inspired Leadership',
    type: 'general',
    level: 8,
    description: 'Your leaders are exemplars. While at least three leaders are invested, gain a +1 status bonus to Quell Unrest checks. If five or more leaders are invested, the bonus is +2.',
  },
  {
    id: 'iron-will',
    name: 'Iron Will',
    type: 'general',
    level: 8,
    description: 'Your kingdom resists fear and intimidation. Gain a +2 status bonus to checks against fear, demoralization, and morale-based events.',
  },
  {
    id: 'reliable-supply',
    name: 'Reliable Supply',
    type: 'general',
    level: 8,
    description: 'Your supply chains are robust. Worksites within 3 hexes of a Roaded settlement produce +1 of their commodity per turn.',
  },
  {
    id: 'studied-foes',
    name: 'Studied Foes',
    type: 'general',
    level: 8,
    description: 'Your scholars analyze threats systematically. Gain a +2 circumstance bonus to the first Resolution check against any continuous event each turn.',
  },
  {
    id: 'warrior-tradition',
    name: 'Warrior Tradition',
    type: 'general',
    level: 8,
    description: 'Your kingdom\'s warriors are renowned. Recruit Army succeeds on a 1-step better outcome. New armies start with one bonus tactic of your choice (must be eligible).',
  },

  // Level 10
  {
    id: 'centralized-economy',
    name: 'Centralized Economy',
    type: 'general',
    level: 10,
    description: 'Your treasury manages the kingdom\'s wealth efficiently. Capital Investment activities yield +1 RP at every success tier.',
  },
  {
    id: 'master-of-spies',
    name: 'Master of Spies',
    type: 'general',
    level: 10,
    description: 'Your intelligence network is unmatched. Infiltration and Clandestine Business checks gain a +2 status bonus.',
  },
  {
    id: 'pioneer-spirit',
    name: 'Pioneer Spirit',
    type: 'general',
    level: 10,
    description: 'Your people are ever-eager to expand. Establish Work Site and Claim Hex activities critical-succeed on a roll of 18-20 (instead of 19-20).',
  },
  {
    id: 'standing-army',
    name: 'Standing Army',
    type: 'general',
    level: 10,
    description: 'You maintain a permanent professional force. You can support 1 additional army without paying its Consumption (effectively, one free army upkeep).',
  },

  // Level 12
  {
    id: 'civic-pride',
    name: 'Civic Pride',
    type: 'general',
    level: 12,
    description: 'Your citizens take ownership of their kingdom\'s identity. Reduce all gained Unrest by 1 (minimum 0).',
  },
  {
    id: 'fortress-cities',
    name: 'Fortress Cities',
    type: 'general',
    level: 12,
    description: 'Your settlements are bastions. All settlements gain a +1 status bonus to AC against army Strikes and structures gain Hardness 5.',
  },
  {
    id: 'master-traders',
    name: 'Master Traders',
    type: 'general',
    level: 12,
    description: 'Your merchant princes work miracles. Trade Commodities activities allow exchanges at favorable rates: 2-for-1 becomes 1-for-1 on success or better.',
  },

  // Level 14
  {
    id: 'enduring-realm',
    name: 'Enduring Realm',
    type: 'general',
    level: 14,
    description: 'Your kingdom is built to last. Reduce all gained Decay by 1 (minimum 0); once per turn, treat the result of a Ruin-related check as one tier better.',
  },
  {
    id: 'high-society',
    name: 'High Society',
    type: 'general',
    level: 14,
    description: 'Your court is the toast of the world. Gain a +1 status bonus to all Arts and Politics checks. Visiting Celebrity events grant +1 Fame on a Success or better.',
  },
  {
    id: 'logistics-mastery',
    name: 'Logistics Mastery',
    type: 'general',
    level: 14,
    description: 'You\'ve perfected supply, transport, and storage. Increase all commodity storage capacities by 5; reduce all Consumption costs by 1.',
  },

  // Level 16
  {
    id: 'glorious-renown',
    name: 'Glorious Renown',
    type: 'general',
    level: 16,
    description: 'Your kingdom\'s deeds are sung from coast to coast. Whenever you would gain Fame, gain 1 additional Fame.',
  },
  {
    id: 'unstoppable-army',
    name: 'Unstoppable Army',
    type: 'general',
    level: 16,
    description: 'Your armies are the stuff of legend. All your armies gain +2 to attack and damage rolls and reduce all damage taken by 5.',
  },

  // Level 18
  {
    id: 'world-in-balance',
    name: 'World in Balance',
    type: 'general',
    level: 18,
    description: 'Your kingdom shapes the world\'s fate. Once per turn, treat any failed kingdom check as a Success instead.',
  },
  {
    id: 'ageless-monuments',
    name: 'Ageless Monuments',
    type: 'general',
    level: 18,
    description: 'Your great works will stand for millennia. All Monuments and similar structures grant double their normal benefit, and Decay never reduces below 0.',
  },

  // Level 20
  {
    id: 'paragon-of-rulership',
    name: 'Paragon of Rulership',
    type: 'general',
    level: 20,
    description: 'You and your leaders have achieved the pinnacle of statecraft. Once per turn, automatically critically succeed on any kingdom check.',
  },
];

/** All feats combined. */
export const ALL_FEATS: FeatEntry[] = [
  ...HEARTLAND_FEATS,
  ...GOVERNMENT_FEATS,
  ...GENERAL_FEATS,
];

/** Lookup by id. */
export const FEAT_BY_ID: Record<string, FeatEntry> = {};
for (const f of ALL_FEATS) FEAT_BY_ID[f.id] = f;

/**
 * Filter to feats currently legal to take for a kingdom advancing TO the
 * given target level. Excludes feats already taken.
 *
 * Rules of thumb encoded:
 *   - heartland feat: only at level 1, must match heartland
 *   - government feat: only at level 3, must match government
 *   - general feat: at level 2, 4, 6, ...; level prereq <= targetLevel
 *
 * `kindFilter` lets the caller scope to one type (e.g. only heartland feats).
 */
export function featsAvailableFor(
  takenIds: string[],
  targetLevel: number,
  heartland: string,
  government: string,
  kindFilter?: FeatType,
): FeatEntry[] {
  const taken = new Set(takenIds);
  return ALL_FEATS.filter(f => {
    if (kindFilter && f.type !== kindFilter) return false;
    if (taken.has(f.id)) return false;
    if (f.level > targetLevel) return false;
    if (f.type === 'heartland') {
      if (targetLevel !== 1) return false; // only at level 1
      if (f.requires && heartland.toLowerCase() !== f.requires.toLowerCase()) return false;
    }
    if (f.type === 'government') {
      // Government feats can be picked at level 3 OR later if missed
      if (f.requires && government.toLowerCase() !== f.requires.toLowerCase()) return false;
    }
    return true;
  });
}

/** Returns true when the given level grants a general feat selection. */
export function levelGrantsGeneralFeat(level: number): boolean {
  return level >= 2 && level % 2 === 0;
}

/** Returns true when the given level grants a skill (proficiency) increase. */
export function levelGrantsSkillIncrease(level: number): boolean {
  return level >= 3 && level % 2 === 1;
}
