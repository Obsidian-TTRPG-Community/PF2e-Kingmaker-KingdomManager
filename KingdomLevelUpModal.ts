// =============================================================
// Army roster — types and catalogues
// =============================================================
// Pathfinder 2e Kingmaker AP, Chapter 6 (Warfare). This module defines:
//   - Army type taxonomy (infantry/cavalry/skirmisher/siege)
//   - Condition catalogue (kingdom-scale conditions)
//   - Tactic catalogue (~50 entries; the rules' War Tactics list)
//   - War-gear catalogue (armour, weapons, magical gear)
//   - Army interface + helpers
//
// Catalogue data is rules-as-published as best I can model from memory.
// Some level prerequisites and exact RP costs may be slightly off from a
// specific printing — the army record carries a `houseRulesOverride` free-
// text field for table-side corrections.

// =============================================================
// Army types
// =============================================================

export type ArmyType = 'infantry' | 'cavalry' | 'skirmisher' | 'siege';

export const ARMY_TYPE_LABELS: Record<ArmyType, string> = {
  infantry: 'Infantry',
  cavalry: 'Cavalry',
  skirmisher: 'Skirmisher',
  siege: 'Siege Engine',
};

/** Short rules-summary string for each army type. Shown in the picker. */
export const ARMY_TYPE_DESCRIPTIONS: Record<ArmyType, string> = {
  infantry:
    'Standard foot soldiers. Solid AC and HP, average mobility. Best at holding ground and absorbing damage.',
  cavalry:
    'Mounted units. High mobility and charge damage; somewhat lower HP. Excels in open terrain.',
  skirmisher:
    'Light, mobile irregulars. Lower HP but high Maneuver and ranged options. Best for harassment and scouting.',
  siege:
    'Massive engines of war. Slow and vulnerable in melee but devastating at range vs structures.',
};

// =============================================================
// Conditions (kingdom-scale)
// =============================================================

export type ArmyCondition =
  | 'weakened'   // -2 to Strikes (after taking damage)
  | 'efficient'  // +1 to one stat (boon)
  | 'fortified'  // +1 AC while in defensive position
  | 'mired'      // -2 Maneuver (movement impaired)
  | 'fatigued'   // -1 to all checks (overworked)
  | 'pinned'     // can't move (engaged in melee)
  | 'shaken'     // -1 attack (morale low)
  | 'recovered'; // just recovered (no penalty; informational)

export const ARMY_CONDITION_LABELS: Record<ArmyCondition, string> = {
  weakened: 'Weakened',
  efficient: 'Efficient',
  fortified: 'Fortified',
  mired: 'Mired',
  fatigued: 'Fatigued',
  pinned: 'Pinned',
  shaken: 'Shaken',
  recovered: 'Recovered',
};

export const ARMY_CONDITION_DESCRIPTIONS: Record<ArmyCondition, string> = {
  weakened: '-2 to Strikes. Applied after the army takes meaningful damage.',
  efficient: '+1 to one chosen stat. Lasts until used or end of next battle.',
  fortified: '+1 AC while in a defensive position (garrisoned, fortified hex).',
  mired: '-2 Maneuver. Caused by difficult terrain, rain, magical effects.',
  fatigued: '-1 to all checks. Caused by forced marching, lack of rest.',
  pinned: 'Cannot move. Engaged in melee with another army.',
  shaken: '-1 to attack. Morale faltering after losses or fear effects.',
  recovered: 'Recently restored; no mechanical effect (informational only).',
};

// =============================================================
// Status (where the army is)
// =============================================================

export type ArmyStatus =
  | 'mobilized'   // active and available to act
  | 'garrisoned'  // stationed in a settlement or hex (defensive)
  | 'recovering'  // being restored after damage; can't act this turn
  | 'defeated'    // routed; needs to be re-mobilized
  | 'disbanded';  // disbanded; kept for record but not active

export const ARMY_STATUS_LABELS: Record<ArmyStatus, string> = {
  mobilized: 'Mobilized',
  garrisoned: 'Garrisoned',
  recovering: 'Recovering',
  defeated: 'Defeated',
  disbanded: 'Disbanded',
};

// =============================================================
// Tactic catalogue
// =============================================================
// ~50 War Tactics from the Kingmaker AP appendix.
// For each: id, name, level prerequisite, type restrictions (if any),
// short rules-text description.

export interface TacticEntry {
  id: string;
  name: string;
  /** Minimum army level to learn this tactic. */
  level: number;
  /** If set, only these army types can learn this tactic. */
  armyTypes?: ArmyType[];
  /** Short description. The full mechanical effect is in the rulebook. */
  description: string;
}

export const TACTICS: TacticEntry[] = [
  // ---- Level 1 ----
  { id: 'basic-strike', name: 'Basic Strike', level: 1, description: 'Make a Strike against an enemy army. Always available; not a chosen tactic.' },
  { id: 'engulfing-charge', name: 'Engulfing Charge', level: 1, armyTypes: ['cavalry', 'skirmisher'], description: 'Move and Strike with a +1 circumstance bonus on the attack. Cavalry and skirmishers excel at this.' },
  { id: 'hold-the-line', name: 'Hold the Line', level: 1, armyTypes: ['infantry'], description: 'Until your next turn, your army gains +1 AC and resists being moved by enemy armies.' },
  { id: 'live-off-the-land', name: 'Live off the Land', level: 1, description: "Forage instead of consuming Food. The army doesn't add to kingdom Consumption this turn." },
  { id: 'sound-the-charge', name: 'Sound the Charge', level: 1, description: 'Boost morale: nearby allied armies gain +1 to attack until your next turn.' },
  { id: 'surprise-attack', name: 'Surprise Attack', level: 1, armyTypes: ['skirmisher'], description: 'If you initiated combat, your first Strike has +2 attack and the target is flat-footed.' },

  // ---- Level 2 ----
  { id: 'darting-attack', name: 'Darting Attack', level: 2, armyTypes: ['skirmisher', 'cavalry'], description: 'Move, Strike, then move again. Avoid retaliation by repositioning.' },
  { id: 'defensive-stance', name: 'Defensive Stance', level: 2, description: 'Your army gains +2 AC until your next turn but cannot move.' },
  { id: 'distracting-feint', name: 'Distracting Feint', level: 2, description: 'A nearby allied army gains +1 attack against your target until your next turn.' },
  { id: 'shielded-troops', name: 'Shielded Troops', level: 2, armyTypes: ['infantry'], description: 'Reduce damage from a single Strike against your army by 5.' },

  // ---- Level 3 ----
  { id: 'cavalry-experts', name: 'Cavalry Experts', level: 3, armyTypes: ['cavalry'], description: 'Your charges deal +2 damage and ignore difficult terrain.' },
  { id: 'covering-fire', name: 'Covering Fire', level: 3, description: 'Allied armies advancing within range of your Strikes gain +1 AC.' },
  { id: 'rapid-deployment', name: 'Rapid Deployment', level: 3, description: 'Move twice your normal distance during a Deploy Army activity.' },

  // ---- Level 4 ----
  { id: 'counter-tactics', name: 'Counter Tactics', level: 4, description: 'When an enemy army uses a tactic, attempt to neutralise it (Maneuver vs DC).' },
  { id: 'efficient-supply', name: 'Efficient Supply', level: 4, description: 'Reduce the kingdom Consumption cost of this army by 1.' },
  { id: 'forced-march', name: 'Forced March', level: 4, description: 'Move at double speed. Army becomes Fatigued at the end of the turn.' },

  // ---- Level 5 ----
  { id: 'devastating-charge', name: 'Devastating Charge', level: 5, armyTypes: ['cavalry'], description: 'Charge attack deals +1 die of damage on a hit; +2 on critical hit.' },
  { id: 'iron-defense', name: 'Iron Defense', level: 5, armyTypes: ['infantry'], description: 'Your army gains resistance 5 to physical damage until your next turn.' },
  { id: 'overrun', name: 'Overrun', level: 5, description: 'Push through an enemy army to reach a target behind it. Strike first, then move past.' },

  // ---- Level 6 ----
  { id: 'archery-volley', name: 'Archery Volley', level: 6, description: 'Make a ranged Strike against all enemy armies in a line within range.' },
  { id: 'expert-feint', name: 'Expert Feint', level: 6, description: 'Make an enemy flat-footed for two rounds instead of one.' },
  { id: 'flanking', name: 'Flanking', level: 6, description: 'When two of your armies are adjacent to a single enemy, both gain +1 to attack.' },

  // ---- Level 7 ----
  { id: 'double-time', name: 'Double Time', level: 7, description: 'On a forced march, the army does not become Fatigued.' },
  { id: 'foraging', name: 'Foraging', level: 7, description: 'Reduce Consumption by 1 for all armies sharing this hex.' },
  { id: 'siege-bombardment', name: 'Siege Bombardment', level: 7, armyTypes: ['siege'], description: 'Strike a structure or settlement with a +2 circumstance bonus on damage.' },

  // ---- Level 8 ----
  { id: 'awe-inspiring', name: 'Awe-Inspiring', level: 8, description: 'Demoralise: a hit causes the enemy army to become Shaken until end of next turn.' },
  { id: 'guerrilla-warfare', name: 'Guerrilla Warfare', level: 8, armyTypes: ['skirmisher'], description: 'After Striking, your army can move full distance and become hidden until detected.' },

  // ---- Level 9 ----
  { id: 'flash-of-tactics', name: 'Flash of Tactics', level: 9, description: 'Once per battle, treat any roll of 10-19 as a critical success.' },
  { id: 'master-strategist', name: 'Master Strategist', level: 9, description: 'At the start of a battle, learn the tactics in your enemies\' arsenals. Add +1 to your defensive checks.' },

  // ---- Level 10 ----
  { id: 'crushing-formation', name: 'Crushing Formation', level: 10, armyTypes: ['infantry'], description: 'Combine two infantry armies into a temporary super-unit for one battle.' },
  { id: 'lightning-strike', name: 'Lightning Strike', level: 10, armyTypes: ['cavalry'], description: 'Move twice and Strike on the same turn. Strike has +1 to attack.' },

  // ---- Level 11 ----
  { id: 'hardened-veterans', name: 'Hardened Veterans', level: 11, description: 'Your army resists fear effects: cannot become Shaken or Demoralised this battle.' },
  { id: 'indomitable', name: 'Indomitable', level: 11, description: 'Once per battle, when your army would be Defeated, instead it has 1 HP and is Weakened.' },

  // ---- Level 12 ----
  { id: 'echo-of-the-charge', name: 'Echo of the Charge', level: 12, armyTypes: ['cavalry'], description: 'After a Devastating Charge, immediately reposition.' },
  { id: 'wave-of-banners', name: 'Wave of Banners', level: 12, description: 'All allied armies within range gain +2 to morale checks until end of next turn.' },

  // ---- Level 13 ----
  { id: 'collapsing-defenses', name: 'Collapsing Defenses', level: 13, armyTypes: ['siege'], description: 'A siege Strike against a structure deals +1 die of damage.' },
  { id: 'reinforcements', name: 'Reinforcements', level: 13, description: 'Spend a tactic slot to instantly heal HP equal to half the army\'s max HP.' },

  // ---- Level 14 ----
  { id: 'phantom-feint', name: 'Phantom Feint', level: 14, description: 'Misdirect: your next attack hits as if you had concealment, gaining the equivalent of a flank.' },

  // ---- Level 15+ ----
  { id: 'living-bulwark', name: 'Living Bulwark', level: 15, armyTypes: ['infantry'], description: 'Your army gains resistance 10 to all damage until your next turn.' },
  { id: 'marshal-the-host', name: 'Marshal the Host', level: 16, description: 'All allied armies in the same hex gain +1 to attack and AC.' },
  { id: 'scattering-strike', name: 'Scattering Strike', level: 17, description: 'Hit an enemy army; on a critical hit, force it to move 1 hex in a direction of your choice.' },
  { id: 'crushing-doom', name: 'Crushing Doom', level: 18, description: 'Devastating area attack. All adjacent enemy armies suffer half your normal damage.' },
  { id: 'phalanx-of-legend', name: 'Phalanx of Legend', level: 19, armyTypes: ['infantry'], description: 'Your army gains +5 AC and resistance 15 until your next turn. Cannot move.' },
  { id: 'apex-warriors', name: 'Apex Warriors', level: 20, description: 'Your army acts twice per round. The first attack is a critical hit on a 19-20.' },
];

/** Build a quick lookup by id. */
export const TACTIC_BY_ID: Record<string, TacticEntry> = {};
for (const t of TACTICS) TACTIC_BY_ID[t.id] = t;

/** Filter tactics by army level + type. */
export function tacticsAvailableFor(armyLevel: number, armyType: ArmyType): TacticEntry[] {
  return TACTICS.filter(t => {
    if (t.level > armyLevel) return false;
    if (t.armyTypes && !t.armyTypes.includes(armyType)) return false;
    return true;
  });
}

/** Tactic slots an army of a given level has. */
export function tacticSlotsForLevel(level: number): number {
  // Per the rules: 1 slot at lvl 1, +1 every 2 levels (so 1@1, 2@3, 3@5, ... 10@19).
  return 1 + Math.floor((level - 1) / 2);
}

// =============================================================
// War gear catalogue
// =============================================================

export type GearSlot = 'armour' | 'weapon' | 'magical' | 'consumable';

export const GEAR_SLOT_LABELS: Record<GearSlot, string> = {
  armour: 'Armour',
  weapon: 'Weapon',
  magical: 'Magical',
  consumable: 'Consumable',
};

export interface GearEntry {
  id: string;
  name: string;
  slot: GearSlot;
  /** Minimum army level to outfit. */
  level: number;
  /** RP cost to outfit (one-time). */
  rpCost: number;
  /** Short rules-summary effect. */
  effect: string;
}

export const GEAR: GearEntry[] = [
  // ---- Armour ----
  { id: 'field-armor', name: 'Field Armor', slot: 'armour', level: 1, rpCost: 1, effect: '+1 circumstance bonus to AC.' },
  { id: 'heavy-armor', name: 'Heavy Armor', slot: 'armour', level: 3, rpCost: 2, effect: '+2 AC; -1 Maneuver from weight.' },
  { id: 'magical-armor', name: 'Magical Armor', slot: 'armour', level: 8, rpCost: 5, effect: '+1 status bonus to AC; resistance 1 to all damage.' },
  { id: 'enchanted-bulwark', name: 'Enchanted Bulwark', slot: 'armour', level: 14, rpCost: 12, effect: '+2 status bonus to AC; resistance 3 to all damage.' },

  // ---- Weapons ----
  { id: 'standard-weapons', name: 'Standard Weapons', slot: 'weapon', level: 1, rpCost: 0, effect: 'Baseline; no bonus. Default for newly-recruited armies.' },
  { id: 'sturdy-weapons', name: 'Sturdy Weapons', slot: 'weapon', level: 2, rpCost: 1, effect: '+1 to damage rolls.' },
  { id: 'striking-weapons', name: 'Striking Weapons', slot: 'weapon', level: 4, rpCost: 3, effect: '+1 die of damage on Strikes.' },
  { id: 'magical-weapons', name: 'Magical Weapons', slot: 'weapon', level: 6, rpCost: 5, effect: '+1 to attack and damage; bypass low-grade resistances.' },
  { id: 'enchanted-arms', name: 'Enchanted Arms', slot: 'weapon', level: 12, rpCost: 10, effect: '+2 to attack; +1 die of damage.' },
  { id: 'master-crafted', name: 'Master-Crafted Arms', slot: 'weapon', level: 18, rpCost: 20, effect: '+3 to attack and damage; treat critical hits as a tier higher.' },

  // ---- Magical (situational items) ----
  { id: 'banner-of-courage', name: 'Banner of Courage', slot: 'magical', level: 5, rpCost: 4, effect: 'Army cannot become Shaken; +1 to morale checks.' },
  { id: 'healers-supplies', name: "Healer's Supplies", slot: 'magical', level: 3, rpCost: 2, effect: 'Once per turn, restore 1d6 HP at end of phase.' },
  { id: 'oil-of-fortune', name: 'Oil of Fortune', slot: 'magical', level: 7, rpCost: 6, effect: 'Once per battle, reroll a failed Strike or save.' },
  { id: 'crest-of-victory', name: 'Crest of Victory', slot: 'magical', level: 10, rpCost: 10, effect: '+1 status bonus to all checks; immune to Fatigued.' },
  { id: 'scrying-pennant', name: 'Scrying Pennant', slot: 'magical', level: 9, rpCost: 8, effect: 'Sense enemy armies within 5 hexes; cannot be Surprised.' },

  // ---- Consumables (one-shot) ----
  { id: 'alchemical-fire', name: 'Alchemical Fire', slot: 'consumable', level: 2, rpCost: 1, effect: 'Single Strike deals +1d6 fire damage.' },
  { id: 'rallying-horn', name: 'Rallying Horn', slot: 'consumable', level: 4, rpCost: 2, effect: 'Once: remove Shaken from this and all adjacent allied armies.' },
  { id: 'potion-of-haste', name: 'Potion of Haste', slot: 'consumable', level: 6, rpCost: 4, effect: 'Once: take a third action this turn.' },
  { id: 'thunderstone', name: 'Thunderstone', slot: 'consumable', level: 5, rpCost: 3, effect: 'Single Strike: enemy must succeed at a save or become Mired.' },
];

export const GEAR_BY_ID: Record<string, GearEntry> = {};
for (const g of GEAR) GEAR_BY_ID[g.id] = g;

export function gearAvailableFor(armyLevel: number, slot?: GearSlot): GearEntry[] {
  return GEAR.filter(g => g.level <= armyLevel && (slot ? g.slot === slot : true));
}

// =============================================================
// Army interface
// =============================================================

export interface ArmyState {
  /** Stable id (uuid-ish). */
  id: string;
  /** Display name (e.g. "Stetven Pikes"). */
  name: string;
  /** Army level 1-20. */
  level: number;
  /** Army type. */
  type: ArmyType;
  /** Current status. */
  status: ArmyStatus;
  /** Where this army is sited. For garrisoned armies, settlement id. */
  settlementId?: string;
  /** For deployed/mobilized armies, hex coords as "q,r". */
  hexKey?: string;
  /** Current HP. */
  hp: number;
  /** Max HP — derived from type + level + gear bonuses. Stored for stability. */
  maxHp: number;
  /** Active conditions. */
  conditions: ArmyCondition[];
  /** Tactic ids the army knows (must fit within tacticSlotsForLevel). */
  tactics: string[];
  /** Equipped war gear ids, by slot. */
  gear: {
    armour?: string;
    weapon?: string;
    magical?: string[];     // multiple magical items allowed
    consumable?: string[];  // consumables stacked
  };
  /** Free-text override field for table-side rules adjudication. */
  houseRulesOverride?: string;
  /** Free-form notes. */
  notes?: string;
}

/**
 * Compute base stats for a freshly-recruited army of a given level + type.
 * Returns { ac, hp, maneuver, morale, attackMod, damageDie }.
 */
export function baseStatsFor(level: number, type: ArmyType): {
  ac: number; hp: number; maneuver: number; morale: number;
  attackMod: number; damageDie: number;
} {
  // Roughly per the rules: AC scales 1:1 with level + 10 base.
  // HP starts around 5 + 2*level for infantry; less for cavalry/skirmisher; siege variable.
  // Maneuver, morale ~ 5 + level/2.
  // Attack mod = level + 4 baseline for infantry; +5 for cavalry; etc.
  const baseAC = 10 + level;
  const baseAttack = level + 4;
  const damageDie = 6 + Math.floor(level / 4); // 1d6 → 1d8 → 1d10 …

  let hpPerLvl: number;
  let attackBonus = 0;
  let maneuverBonus = 0;
  let acBonus = 0;
  switch (type) {
    case 'infantry':
      hpPerLvl = 4; acBonus = 1; maneuverBonus = -1; break;
    case 'cavalry':
      hpPerLvl = 3; attackBonus = 1; maneuverBonus = 1; break;
    case 'skirmisher':
      hpPerLvl = 2; maneuverBonus = 2; break;
    case 'siege':
      hpPerLvl = 5; attackBonus = 2; maneuverBonus = -2; break;
  }
  const hp = 5 + hpPerLvl * level;
  return {
    ac: baseAC + acBonus,
    hp,
    maneuver: 5 + Math.floor(level / 2) + maneuverBonus,
    morale: 5 + Math.floor(level / 2),
    attackMod: baseAttack + attackBonus,
    damageDie,
  };
}

/** Build a fresh army record. */
export function makeArmy(name: string, level: number, type: ArmyType): ArmyState {
  const stats = baseStatsFor(level, type);
  return {
    id: 'a_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    name,
    level,
    type,
    status: 'mobilized',
    hp: stats.hp,
    maxHp: stats.hp,
    conditions: [],
    tactics: ['basic-strike'],
    gear: { weapon: 'standard-weapons' },
  };
}
