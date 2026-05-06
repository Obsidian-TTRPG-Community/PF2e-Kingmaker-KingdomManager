// =============================================================
// Shared types for the Kingdom Manager plugin
// =============================================================
// Data model overview:
//
//   PluginData
//     ├── kingdoms:    Record<name, KingdomState>     // shared kingdom-level state
//     └── settlements: Record<id,   SettlementState>  // each settlement's grid + borders
//
// A SettlementState references its kingdom by name (`kingdomName: string`).
// Multiple settlements can share one kingdom and so share its level + stockpiles.
//
// =============================================================

export type StructureType = 'STRUCTURE' | 'INFRASTRUCTURE' | 'BUILDING' | 'YARD';
export type StructureTag =
  | 'BUILDING'
  | 'RESIDENTIAL'
  | 'YARD'
  | 'EDIFICE'
  | 'FAMOUS'
  | 'INFAMOUS';

/**
 * Activity ids that buildings can grant item bonuses to. Sourced from the
 * "Royal Kingdom Sheet" Settlements/Structures tabs (which collect every
 * Kingdom-turn downtime activity that a settlement-level item bonus can
 * apply to).
 */
export type Activity =
  // Agriculture
  | 'establish-farmland'
  | 'harvest-crops'
  // Arts
  | 'craft-luxuries'
  | 'create-a-masterpiece'
  | 'repair-reputation-corruption'
  | 'rest-and-relax-arts'
  | 'quell-unrest-arts'
  // Boating
  | 'go-fishing'
  | 'rest-and-relax-boating'
  // Defense
  | 'fortify-hex'
  | 'provide-care'
  // Engineering
  | 'build-roads'
  | 'demolish'
  | 'establish-work-site'
  | 'establish-work-site-lumber-camp'
  | 'establish-work-site-mine'
  | 'establish-work-site-quarry'
  | 'irrigation'
  | 'repair-reputation-decay'
  | 'build-structure'
  // Exploration
  | 'hire-adventurers'
  // Folklore
  | 'celebrate-holiday'
  | 'quell-unrest-folklore'
  // Industry
  | 'relocate-capital'
  | 'repair-reputation-strife'
  | 'trade-commodities'
  // Intrigue
  | 'clandestine-business'
  | 'infiltration'
  | 'quell-unrest-intrigue'
  | 'create-forgeries'
  // Magic
  | 'prognostication'
  | 'quell-unrest-magic'
  | 'supernatural-solution'
  | 'borrow-an-arcane-spell'
  | 'learn-a-spell'
  // Politics
  | 'improve-lifestyle'
  | 'quell-unrest-politics'
  | 'new-leadership'
  // Scholarship
  | 'creative-solution'
  | 'rest-and-relax-scholarship'
  // Statecraft
  | 'send-diplomatic-envoy'
  | 'request-foreign-aid'
  | 'tap-treasury'
  | 'pledge-of-fealty-statecraft'
  // Trade
  | 'capital-investment'
  | 'collect-taxes'
  | 'establish-trade-agreement'
  | 'manage-trade-agreements'
  | 'purchase-commodities'
  | 'rest-and-relax-trade'
  | 'repair-reputation-crime'
  // Warfare
  | 'pledge-of-fealty-warfare'
  | 'quell-unrest-warfare'
  | 'recruit-army'
  | 'train-army'
  | 'recover-army'
  | 'garrison-army'
  | 'deploy-army'
  | 'outfit-army'
  // Wilderness
  | 'rest-and-relax-wilderness'
  | 'gather-livestock'
  // Identification
  | 'identify-alchemy'
  // Investigation / research
  | 'recall-knowledge-investigating'
  | 'researching'
  | 'decipher-writing'
  | 'recall-knowledge-esoteric'
  | 'research-esoteric'
  | 'research-faith'
  // Healing
  | 'treat-disease'
  | 'treat-wounds'
  // Crafting
  | 'craft-metal'
  | 'craft-specialized'
  | 'craft-trade'
  | 'repair'
  // Earn Income / Gather Info
  | 'performance-earn-income'
  | 'gather-information'
  // Leadership special: 3 Leadership-activities/turn instead of 2
  | 'leadership-activities'
  // Activities-only (not granted by buildings as item bonuses)
  | 'pay-consumption'
  | 'claim-hex';

/** Human-readable labels for activities, used in the summary panel. */
export const ACTIVITY_LABELS: Record<Activity, string> = {
  'establish-farmland': 'Establish Farmland',
  'harvest-crops': 'Harvest Crops',
  'craft-luxuries': 'Craft Luxuries',
  'create-a-masterpiece': 'Create a Masterpiece',
  'repair-reputation-corruption': 'Repair Reputation (Corruption)',
  'rest-and-relax-arts': 'Rest and Relax (Arts)',
  'quell-unrest-arts': 'Quell Unrest (Arts)',
  'go-fishing': 'Go Fishing',
  'rest-and-relax-boating': 'Rest and Relax (Boating)',
  'fortify-hex': 'Fortify Hex',
  'provide-care': 'Provide Care',
  'build-roads': 'Build Roads',
  demolish: 'Demolish',
  'establish-work-site': 'Establish Work Site',
  'establish-work-site-lumber-camp': 'Establish Work Site (Lumber Camp)',
  'establish-work-site-mine': 'Establish Work Site (Mine)',
  'establish-work-site-quarry': 'Establish Work Site (Quarry)',
  irrigation: 'Irrigation',
  'repair-reputation-decay': 'Repair Reputation (Decay)',
  'build-structure': 'Build Structure',
  'hire-adventurers': 'Hire Adventurers',
  'celebrate-holiday': 'Celebrate Holiday',
  'quell-unrest-folklore': 'Quell Unrest (Folklore)',
  'relocate-capital': 'Relocate Capital',
  'repair-reputation-strife': 'Repair Reputation (Strife)',
  'trade-commodities': 'Trade Commodities',
  'clandestine-business': 'Clandestine Business',
  infiltration: 'Infiltration',
  'quell-unrest-intrigue': 'Quell Unrest (Intrigue)',
  'create-forgeries': 'Create Forgeries',
  prognostication: 'Prognostication',
  'quell-unrest-magic': 'Quell Unrest (Magic)',
  'supernatural-solution': 'Supernatural Solution',
  'borrow-an-arcane-spell': 'Borrow an Arcane Spell',
  'learn-a-spell': 'Learn a Spell',
  'improve-lifestyle': 'Improve Lifestyle',
  'quell-unrest-politics': 'Quell Unrest (Politics)',
  'new-leadership': 'New Leadership',
  'creative-solution': 'Creative Solution',
  'rest-and-relax-scholarship': 'Rest and Relax (Scholarship)',
  'send-diplomatic-envoy': 'Send Diplomatic Envoy',
  'request-foreign-aid': 'Request Foreign Aid',
  'tap-treasury': 'Tap Treasury',
  'pledge-of-fealty-statecraft': 'Pledge of Fealty (Statecraft)',
  'capital-investment': 'Capital Investment',
  'collect-taxes': 'Collect Taxes',
  'establish-trade-agreement': 'Establish Trade Agreement',
  'manage-trade-agreements': 'Manage Trade Agreements',
  'purchase-commodities': 'Purchase Commodities',
  'rest-and-relax-trade': 'Rest and Relax (Trade)',
  'repair-reputation-crime': 'Repair Reputation (Crime)',
  'pledge-of-fealty-warfare': 'Pledge of Fealty (Warfare)',
  'quell-unrest-warfare': 'Quell Unrest (Warfare)',
  'recruit-army': 'Recruit Army',
  'train-army': 'Train Army',
  'recover-army': 'Recover Army',
  'garrison-army': 'Garrison Army',
  'deploy-army': 'Deploy Army',
  'outfit-army': 'Outfit Army',
  'rest-and-relax-wilderness': 'Rest and Relax (Wilderness)',
  'gather-livestock': 'Gather Livestock',
  'identify-alchemy': 'Identify Alchemy',
  'recall-knowledge-investigating': 'Recall Knowledge (Investigating)',
  researching: 'Researching',
  'decipher-writing': 'Decipher Writing',
  'recall-knowledge-esoteric': 'Recall Knowledge (Esoteric)',
  'research-esoteric': 'Research (Esoteric)',
  'research-faith': 'Research (Faith)',
  'treat-disease': 'Treat Disease',
  'treat-wounds': 'Treat Wounds',
  'craft-metal': 'Craft (Metal)',
  'craft-specialized': 'Craft (Specialized)',
  'craft-trade': 'Craft (Trade)',
  repair: 'Repair',
  'performance-earn-income': 'Performance (Earn Income)',
  'gather-information': 'Gather Information',
  'leadership-activities': 'Leadership Activities/turn',
  'pay-consumption': 'Pay Consumption',
  'claim-hex': 'Claim Hex',
};

/**
 * Per-tradition item availability buckets. Each tracks an offset above
 * the settlement's base level for items of that flavour.
 */
export type ItemTradition = 'base' | 'alchemical' | 'arcane' | 'divine' | 'primal' | 'luxurious';

export const ITEM_TRADITION_LABELS: Record<ItemTradition, string> = {
  base: 'General items',
  alchemical: 'Alchemical',
  arcane: 'Arcane',
  divine: 'Divine',
  primal: 'Primal',
  luxurious: 'Luxury',
};

/** Static metadata about a structure. */
export interface BuildingMetadata {
  id: string;
  name: string;
  type: StructureType;
  tags: StructureTag[];
  level: number;
  /** 0 for infrastructure / borders. */
  lots: 0 | 1 | 2 | 4;
  /** True if this building counts as a Residential lot for population purposes. */
  residential: boolean;
  cost: string;
  construction: string;
  upgradeFrom: string;
  upgradeTo: string;
  ruin: string;
  description: string;
  effects: string;
  /**
   * Activity-specific item bonuses granted by this single placement of the
   * building. (Same building × N placements → bonus is taken once unless the
   * effect text says otherwise; summary.ts handles aggregation/highest-wins.)
   */
  itemBonuses?: { activity: Activity; bonus: number }[];
  /**
   * Item-level adjustments by tradition. Stacking caps (typically +3 per
   * tradition) are enforced in summary.ts.
   */
  traditionBonuses?: Partial<Record<ItemTradition, number>>;
  image?: string;
}

// =============================================================
// Kingdom abilities, ruin, leadership, turn (PF2e Kingmaker)
// =============================================================

/** The 16 kingdom abilities per Pathfinder 2e Kingmaker. */
export type KingdomAbility =
  | 'agriculture'
  | 'arts'
  | 'boating'
  | 'defense'
  | 'engineering'
  | 'exploration'
  | 'folklore'
  | 'industry'
  | 'intrigue'
  | 'magic'
  | 'politics'
  | 'scholarship'
  | 'statecraft'
  | 'trade'
  | 'warfare'
  | 'wilderness';

export const KINGDOM_ABILITIES: KingdomAbility[] = [
  'agriculture', 'arts', 'boating', 'defense', 'engineering', 'exploration',
  'folklore', 'industry', 'intrigue', 'magic', 'politics', 'scholarship',
  'statecraft', 'trade', 'warfare', 'wilderness',
];

export const KINGDOM_ABILITY_LABELS: Record<KingdomAbility, string> = {
  agriculture: 'Agriculture',
  arts: 'Arts',
  boating: 'Boating',
  defense: 'Defense',
  engineering: 'Engineering',
  exploration: 'Exploration',
  folklore: 'Folklore',
  industry: 'Industry',
  intrigue: 'Intrigue',
  magic: 'Magic',
  politics: 'Politics',
  scholarship: 'Scholarship',
  statecraft: 'Statecraft',
  trade: 'Trade',
  warfare: 'Warfare',
  wilderness: 'Wilderness',
};

/** Proficiency rank for kingdom skills. Tracked separately per ability. */
export type Proficiency = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary';

export const PROFICIENCY_BONUS: Record<Proficiency, number> = {
  untrained: 0,
  trained: 2,
  expert: 4,
  master: 6,
  legendary: 8,
};

/** The four Ruin tracks. */
export type RuinName = 'corruption' | 'crime' | 'decay' | 'strife';

export const RUIN_LABELS: Record<RuinName, string> = {
  corruption: 'Corruption',
  crime: 'Crime',
  decay: 'Decay',
  strife: 'Strife',
};

/** Each ruin has a current value, a threshold, and an item-penalty count. */
export interface RuinTrack {
  /** Current points in this ruin. */
  value: number;
  /** Threshold above which Ruin Penalty increases. Standard is 10. */
  threshold: number;
  /** Number of item-penalty increases beyond the threshold. */
  penalty: number;
}

/** The 11 Leadership roles per the rules. */
export type LeadershipRole =
  | 'ruler'
  | 'counselor'
  | 'general'
  | 'emissary'
  | 'magister'
  | 'marshal'
  | 'treasurer'
  | 'viceroy'
  | 'warden'
  | 'royal-enforcer'
  | 'minister';

export const LEADERSHIP_ROLE_LABELS: Record<LeadershipRole, string> = {
  ruler: 'Ruler',
  counselor: 'Counselor',
  general: 'General',
  emissary: 'Emissary',
  magister: 'Magister',
  marshal: 'Marshal',
  treasurer: 'Treasurer',
  viceroy: 'Viceroy',
  warden: 'Warden',
  'royal-enforcer': 'Royal Enforcer',
  minister: 'Minister',
};

/** Which kingdom ability a leadership role bumps when invested + filled. */
export const LEADERSHIP_ROLE_ABILITY: Record<LeadershipRole, KingdomAbility | null> = {
  ruler: null, // Ruler boosts a Loyalty-themed skill, but PF2e KM treats it as the leader of the realm — typically buffs whatever skill it advises.
  counselor: 'politics',
  general: 'warfare',
  emissary: 'statecraft',
  magister: 'magic',
  marshal: 'wilderness',
  treasurer: 'trade',
  viceroy: 'industry',
  warden: 'defense',
  'royal-enforcer': 'intrigue',
  minister: 'scholarship',
};

/** Vacancy penalty descriptions per role (rules-as-written summary). */
export const LEADERSHIP_VACANCY_PENALTY: Record<LeadershipRole, string> = {
  ruler: '–4 to most Leadership activities; Unrest +1/turn.',
  counselor: 'Cannot Quell Unrest; Culture-based skills –1.',
  general: 'Cannot Recruit/Outfit/Train Army; Warfare-based skills –1.',
  emissary: 'Cannot Send Diplomatic Envoy / Request Foreign Aid; Loyalty-based skills –1.',
  magister: 'Cannot Supernatural Solution / Quell Unrest (Magic); Magic-based skills –1.',
  marshal: 'Cannot Establish Work Site / Hex tasks; Wilderness-based skills –1.',
  treasurer: 'Cannot Capital Investment / Collect Taxes; Trade-based skills –1.',
  viceroy: 'Cannot Build Structure / Establish Trade Agreement; Industry-based skills –1.',
  warden: 'Cannot Fortify Hex / Garrison Army; Defense-based skills –1.',
  'royal-enforcer': 'Cannot Quell Unrest (Intrigue); +1 Crime Ruin/turn.',
  minister: 'Cannot Creative Solution / Repair Reputation (Decay); Scholarship-based skills –1.',
};

export interface LeadershipSlot {
  role: LeadershipRole;
  /** Name of the leader, free text. Empty = vacant. */
  name: string;
  /** Whether the role is filled by a PC. */
  isPC: boolean;
  /** Whether this leader has been formally invested. Uninvested leaders give no bonus. */
  invested: boolean;
}

/** The five phases of a Kingdom turn. */
export type TurnPhase = 'upkeep' | 'commerce' | 'leadership' | 'event' | 'civic';

export const TURN_PHASE_LABELS: Record<TurnPhase, string> = {
  upkeep: 'Upkeep',
  commerce: 'Commerce',
  leadership: 'Leadership',
  event: 'Event',
  civic: 'Civic',
};

export const TURN_PHASE_ORDER: TurnPhase[] = ['upkeep', 'commerce', 'leadership', 'event', 'civic'];

export interface TurnState {
  /** Current turn number, starting at 1. */
  number: number;
  /** Current phase. */
  phase: TurnPhase;
  /** Activity slots used this turn. Default cap = 2 leadership + per-settlement civic. */
  leadershipActivitiesUsed: number;
  /**
   * Per-leader activity counts this turn, keyed by LeadershipRole. The rules
   * say each leader takes one activity per phase in Commerce/Region; in
   * Leadership phase a leader can take more than one if there are slots.
   * Empty/missing = no activities used yet this turn.
   */
  perLeaderUsed?: Partial<Record<string /* LeadershipRole */, number>>;
  /** Activities resolved this turn (for the attempt history UI). */
  attempts?: ActivityAttempt[];
}

/** Outcome tier from a kingdom check (per PF2e success-tier rules). */
export type OutcomeTier = 'critical-success' | 'success' | 'failure' | 'critical-failure';

export const OUTCOME_TIER_LABELS: Record<OutcomeTier, string> = {
  'critical-success': 'Critical Success',
  success: 'Success',
  failure: 'Failure',
  'critical-failure': 'Critical Failure',
};

/**
 * A single attempted activity, recorded in turn history.
 * Persists the roll, the chosen outcome tier (after any GM override), and
 * a free-form notes field for table-side adjudications.
 */
export interface ActivityAttempt {
  /** Stable id. */
  id: string;
  /** Activity id from the catalogue (matches the Activity type). */
  activityId: Activity;
  /** Turn this happened on. */
  turn: number;
  /** Phase this happened in. */
  phase: TurnPhase;
  /** Leader role that took the activity (if applicable). */
  leaderRole?: LeadershipRole;
  /** d20 result (1-20). */
  d20: number;
  /** Total skill modifier applied (mod + prof + level + item bonuses). */
  modifier: number;
  /** Total roll (d20 + modifier). */
  total: number;
  /** DC the roll was made against. */
  dc: number;
  /** Outcome tier — auto-derived from roll, may be overridden by user. */
  outcome: OutcomeTier;
  /** Whether outcome was manually overridden after roll. */
  overridden: boolean;
  /** Optional table-side notes the GM entered before applying. */
  notes?: string;
}

/** Free-form event log entry. */
export interface KingdomEvent {
  id: string;
  /** Turn number this happened on. */
  turn: number;
  /** Phase, optional. */
  phase?: TurnPhase;
  /** Brief title shown in the log header. */
  title: string;
  /** Free-form body — what happened, outcome, GM notes. */
  notes: string;
  /** Whether this entry is currently expanded in the UI. (UI state, persisted.) */
  expanded?: boolean;
}

/** Government type. Determines starting ability/skill bonuses and feats. */
export type Government =
  | 'despotism'
  | 'feudalism'
  | 'oligarchy'
  | 'republic'
  | 'thaumacracy'
  | 'yeomanry'
  | 'other';

export const GOVERNMENT_LABELS: Record<Government, string> = {
  despotism: 'Despotism',
  feudalism: 'Feudalism',
  oligarchy: 'Oligarchy',
  republic: 'Republic',
  thaumacracy: 'Thaumacracy',
  yeomanry: 'Yeomanry',
  other: 'Other',
};

/** Alignment. */
export type Alignment = 'LG' | 'NG' | 'CG' | 'LN' | 'N' | 'CN' | 'LE' | 'NE' | 'CE';

export const ALIGNMENTS: Alignment[] = ['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE'];

// =============================================================
// Saved kingdom + settlement state
// =============================================================

// =============================================================
// Hex map (PF2e Kingmaker territory tracking)
// =============================================================
// Pointy-top hex orientation, axial coordinates (q, r).
// q increases east-ish, r increases south-east-ish.
// Cube coords: x=q, z=r, y=-x-z (only used for distance math).

/**
 * Terrain types per the Kingmaker AP. Affects what worksites can be placed,
 * movement cost, encounter difficulty, and starting commodity yields.
 */
export type Terrain =
  | 'plains'
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'swamp'
  | 'desert'
  | 'wetland'
  | 'lake';

export const TERRAIN_LABELS: Record<Terrain, string> = {
  plains: 'Plains',
  forest: 'Forest',
  hills: 'Hills',
  mountains: 'Mountains',
  swamp: 'Swamp',
  desert: 'Desert',
  wetland: 'Wetland',
  lake: 'Lake',
};

/**
 * Worksites a kingdom can establish on a hex via Establish Work Site.
 * Each is restricted to specific terrains:
 *   lumber-camp → forest
 *   mine        → hills, mountains
 *   quarry      → hills, mountains
 *   farmland    → plains, wetland
 */
export type Worksite = 'lumber-camp' | 'mine' | 'quarry' | 'farmland';

export const WORKSITE_LABELS: Record<Worksite, string> = {
  'lumber-camp': 'Lumber Camp',
  mine: 'Mine',
  quarry: 'Quarry',
  farmland: 'Farmland',
};

/** Which terrains permit which worksites. */
export const WORKSITE_ALLOWED_TERRAINS: Record<Worksite, Terrain[]> = {
  'lumber-camp': ['forest'],
  mine: ['hills', 'mountains'],
  quarry: ['hills', 'mountains'],
  farmland: ['plains', 'wetland'],
};

/**
 * Hex edges, identified 0-5 per the standard pointy-top convention:
 *   0 = NE, 1 = E, 2 = SE, 3 = SW, 4 = W, 5 = NW
 * Used for placing roads. A road on edge N is shared with the neighbour
 * across that edge (we always store the road on whichever side is
 * canonically lower per the dedupe rule in hex.ts).
 */
export type HexEdge = 0 | 1 | 2 | 3 | 4 | 5;

export interface HexData {
  /** Axial coordinates. Stored redundantly for convenience. */
  q: number;
  r: number;
  /** Whether the kingdom has formally claimed this hex. */
  claimed: boolean;
  /** Terrain type. Default plains for newly created hexes. */
  terrain: Terrain;
  /** Worksite present, if any. */
  worksite?: Worksite;
  /** Settlement id sited here, if any. References PluginData.settlements. */
  settlementId?: string;
  /** Roads on each of the 6 edges. */
  roads: { 0: boolean; 1: boolean; 2: boolean; 3: boolean; 4: boolean; 5: boolean };
  /** Free-form note for this hex (special features, encounters, etc.). */
  notes?: string;
}

/** Build a fresh, empty hex with sensible defaults. */
export function makeEmptyHex(q: number, r: number): HexData {
  return {
    q,
    r,
    claimed: false,
    terrain: 'plains',
    roads: { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false },
  };
}

/** Stringify axial coords for use as a Record key. */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Parse a hex key back into axial coords. */
export function parseHexKey(key: string): { q: number; r: number } {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}


export interface KingdomState {
  // ---- Identity ----
  /** Display name. Used as the lookup key. */
  name: string;
  /** Kingdom level 1–20. Restricts what can be built. */
  level: number;
  /** Experience points toward next level. 1000/level boundary. */
  xp: number;
  /** Government form. */
  government: Government;
  /** Alignment. */
  alignment: Alignment;
  /** Free-text charter description (Conquest / Exploration / Grant / Open). */
  charter: string;
  /** Free-text heartland (Forest / Hill / Lake / Mountain / Plain / Ruins / Swamp). */
  heartland: string;
  /** Primary language of the kingdom. */
  language: string;

  // ---- Resources / status ----
  /** Current commodity stockpiles. */
  stockpiles: {
    rp: number;
    food: number;
    lumber: number;
    luxuries: number;
    ore: number;
    stone: number;
  };
  /** Number of claimed hexes. Used to derive Size, which factors into Control DC. */
  claimedHexes: number;
  /** Current Unrest (each point gives a status penalty). */
  unrest: number;
  /** Fame OR Infamy current value. */
  fame: number;
  /** Whether the kingdom tracks Fame (good-aligned) or Infamy (evil). */
  isInfamous: boolean;

  // ---- Abilities ----
  /** Score in each kingdom ability (10 = average). */
  abilities: Record<KingdomAbility, number>;
  /** Proficiency rank in each ability's skill (used for skill modifier). */
  proficiencies: Record<KingdomAbility, Proficiency>;

  // ---- Ruin ----
  ruin: Record<RuinName, RuinTrack>;

  // ---- Leadership ----
  leadership: LeadershipSlot[];

  // ---- Turn / events ----
  turn: TurnState;
  events: KingdomEvent[];

  // ---- Hex map ----
  /**
   * Hex map data. Keys are axial coordinates "q,r"; values describe each hex.
   * Pointy-top orientation; q increases right, r increases down-right.
   * Only hexes the user has touched (claimed, terrain set, etc.) are stored.
   * Empty map = blank canvas to be filled in.
   */
  hexes: Record<string, HexData>;

  // ---- Armies ----
  /**
   * Army roster. Keyed by army id. Garrisoned armies reference settlements;
   * mobilized armies may reference a hex via `hexKey`.
   */
  armies: Record<string, import('./armies').ArmyState>;

  /**
   * Active and historical event instances. Keyed by instance id. Persistent
   * events stay here until resolved (or dismissed); resolved events stay for
   * narrative reference.
   */
  eventInstances: Record<string, import('./events').EventInstance>;

  /**
   * Kingdom feats taken via the level-up wizard. Stored as feat ids; look
   * them up via FEAT_BY_ID from feats.ts. Order is taken-order (earliest
   * first), used for the kingdom sheet's Feats display.
   */
  feats: string[];

  // ---- Free notes ----
  notes: string;
}

export type BorderSide = 'top' | 'right' | 'bottom' | 'left';

export interface BorderState {
  water: boolean;
  bridge: boolean;
  wall: 'none' | 'wood' | 'stone';
}

export interface Placement {
  id: string;
  buildingId: string;
  /** Lot indices this placement covers. Length 1 / 2 / 4. */
  lots: number[];
  /** Optional user note (e.g. "Bakery" for a trade shop). */
  note?: string;
}

export interface SettlementState {
  name: string;
  /** Kingdom this settlement belongs to (key into PluginData.kingdoms). */
  kingdomName: string;
  isCapital: boolean;
  placements: Placement[];
  borders: Record<BorderSide, BorderState>;
  infrastructure: {
    pavedStreets: boolean;
    sewerSystem: boolean;
    magicalStreetlamps: boolean;
  };
  /** Block-level water adjacency overrides; when empty, derived from borders. */
  waterBlocks?: number[];
  notes?: string;
}

export interface PluginData {
  kingdoms: Record<string, KingdomState>;
  settlements: Record<string, SettlementState>;
}

export const DEFAULT_PLUGIN_DATA: PluginData = { kingdoms: {}, settlements: {} };

export function makeEmptyKingdom(name = 'New Kingdom'): KingdomState {
  // Start abilities at 10 (no modifier), untrained proficiency.
  const abilities = {} as Record<KingdomAbility, number>;
  const proficiencies = {} as Record<KingdomAbility, Proficiency>;
  for (const ab of KINGDOM_ABILITIES) {
    abilities[ab] = 10;
    proficiencies[ab] = 'untrained';
  }

  return {
    name,
    level: 1,
    xp: 0,
    government: 'feudalism',
    alignment: 'N',
    charter: '',
    heartland: '',
    language: 'Common',
    stockpiles: { rp: 0, food: 0, lumber: 0, luxuries: 0, ore: 0, stone: 0 },
    claimedHexes: 1,
    unrest: 0,
    fame: 0,
    isInfamous: false,
    abilities,
    proficiencies,
    ruin: {
      corruption: { value: 0, threshold: 10, penalty: 0 },
      crime: { value: 0, threshold: 10, penalty: 0 },
      decay: { value: 0, threshold: 10, penalty: 0 },
      strife: { value: 0, threshold: 10, penalty: 0 },
    },
    leadership: [
      { role: 'ruler', name: '', isPC: false, invested: false },
      { role: 'counselor', name: '', isPC: false, invested: false },
      { role: 'general', name: '', isPC: false, invested: false },
      { role: 'emissary', name: '', isPC: false, invested: false },
      { role: 'magister', name: '', isPC: false, invested: false },
      { role: 'marshal', name: '', isPC: false, invested: false },
      { role: 'treasurer', name: '', isPC: false, invested: false },
      { role: 'viceroy', name: '', isPC: false, invested: false },
      { role: 'warden', name: '', isPC: false, invested: false },
      { role: 'royal-enforcer', name: '', isPC: false, invested: false },
      { role: 'minister', name: '', isPC: false, invested: false },
    ],
    turn: { number: 1, phase: 'upkeep', leadershipActivitiesUsed: 0 },
    events: [],
    hexes: {},
    armies: {},
    eventInstances: {},
    feats: [],
    notes: '',
  };
}

/**
 * Migrate an old/partial KingdomState (e.g. from v0.3 saved data) to the
 * current shape. Idempotent — safe to call on already-current records.
 */
export function migrateKingdom(k: Partial<KingdomState> & { name: string }): KingdomState {
  const fresh = makeEmptyKingdom(k.name);
  return {
    ...fresh,
    ...k,
    // Deep-merge mandatory sub-objects so partial saves don't lose fields.
    stockpiles: { ...fresh.stockpiles, ...(k.stockpiles ?? {}) },
    abilities: { ...fresh.abilities, ...(k.abilities ?? {}) },
    proficiencies: { ...fresh.proficiencies, ...(k.proficiencies ?? {}) },
    ruin: {
      corruption: { ...fresh.ruin.corruption, ...((k.ruin as any)?.corruption ?? {}) },
      crime: { ...fresh.ruin.crime, ...((k.ruin as any)?.crime ?? {}) },
      decay: { ...fresh.ruin.decay, ...((k.ruin as any)?.decay ?? {}) },
      strife: { ...fresh.ruin.strife, ...((k.ruin as any)?.strife ?? {}) },
    },
    leadership: k.leadership && k.leadership.length === fresh.leadership.length
      ? k.leadership
      : fresh.leadership,
    turn: { ...fresh.turn, ...(k.turn ?? {}) },
    events: k.events ?? [],
    hexes: k.hexes ?? {},
    armies: k.armies ?? {},
    eventInstances: k.eventInstances ?? {},
    feats: k.feats ?? [],
    notes: k.notes ?? '',
  };
}

export function makeEmptySettlement(name = 'New Settlement', kingdomName = 'Default Kingdom'): SettlementState {
  return {
    name,
    kingdomName,
    isCapital: false,
    placements: [],
    borders: {
      top: { water: false, bridge: false, wall: 'none' },
      right: { water: false, bridge: false, wall: 'none' },
      bottom: { water: false, bridge: false, wall: 'none' },
      left: { water: false, bridge: false, wall: 'none' },
    },
    infrastructure: {
      pavedStreets: false,
      sewerSystem: false,
      magicalStreetlamps: false,
    },
    waterBlocks: [],
    notes: '',
  };
}

// =============================================================
// Grid geometry helpers (3×3 blocks, 2×2 lots = 36 lots total)
// =============================================================

export const GRID_BLOCKS_PER_SIDE = 3;
export const LOTS_PER_BLOCK_SIDE = 2;
export const GRID_LOTS_PER_SIDE = GRID_BLOCKS_PER_SIDE * LOTS_PER_BLOCK_SIDE; // 6
export const TOTAL_LOTS = GRID_LOTS_PER_SIDE * GRID_LOTS_PER_SIDE; // 36
export const TOTAL_BLOCKS = GRID_BLOCKS_PER_SIDE * GRID_BLOCKS_PER_SIDE; // 9

/** Block letters per the spreadsheet's identifiers (A..I). */
export const BLOCK_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;

/** Lot positions within a block (matches the spreadsheet's labels). */
export const LOT_POSITIONS_IN_BLOCK = ['1', '2', '3', '4'] as const;

export function lotToColRow(lot: number): { col: number; row: number } {
  return { col: lot % GRID_LOTS_PER_SIDE, row: Math.floor(lot / GRID_LOTS_PER_SIDE) };
}

export function colRowToLot(col: number, row: number): number {
  return row * GRID_LOTS_PER_SIDE + col;
}

export function lotToBlock(lot: number): number {
  const { col, row } = lotToColRow(lot);
  const blockCol = Math.floor(col / LOTS_PER_BLOCK_SIDE);
  const blockRow = Math.floor(row / LOTS_PER_BLOCK_SIDE);
  return blockRow * GRID_BLOCKS_PER_SIDE + blockCol;
}

export function lotsInSameBlock(lot: number): number[] {
  const block = lotToBlock(lot);
  const blockCol = block % GRID_BLOCKS_PER_SIDE;
  const blockRow = Math.floor(block / GRID_BLOCKS_PER_SIDE);
  const startCol = blockCol * LOTS_PER_BLOCK_SIDE;
  const startRow = blockRow * LOTS_PER_BLOCK_SIDE;
  const out: number[] = [];
  for (let dr = 0; dr < LOTS_PER_BLOCK_SIDE; dr++) {
    for (let dc = 0; dc < LOTS_PER_BLOCK_SIDE; dc++) {
      out.push(colRowToLot(startCol + dc, startRow + dr));
    }
  }
  return out;
}

/** Identifier for a single lot, e.g. "A1", "C4". */
export function lotIdentifier(lot: number): string {
  const block = lotToBlock(lot);
  const blockLetter = BLOCK_LETTERS[block];
  const blockLots = lotsInSameBlock(lot);
  const posIndex = blockLots.indexOf(lot);
  const posLabel = LOT_POSITIONS_IN_BLOCK[posIndex] ?? '?';
  return `${blockLetter}${posLabel}`;
}

export function lotIsOnWaterBorder(lot: number, state: SettlementState): boolean {
  const { col, row } = lotToColRow(lot);
  const block = lotToBlock(lot);
  if (state.waterBlocks?.includes(block)) return true;
  if (state.borders.top.water && row === 0) return true;
  if (state.borders.bottom.water && row === GRID_LOTS_PER_SIDE - 1) return true;
  if (state.borders.left.water && col === 0) return true;
  if (state.borders.right.water && col === GRID_LOTS_PER_SIDE - 1) return true;
  return false;
}
