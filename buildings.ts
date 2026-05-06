// =============================================================
// Settlement Summary aggregation
// =============================================================
// Given a SettlementState + the KingdomState it belongs to, derive everything
// we want to display: type/level, consumption, max item bonus, per-tradition
// item levels, the activity-bonus matrix, capacity bonuses, warnings.
//
// Rules notes (Kingmaker AP / AoN / spreadsheet):
//   - Settlement level = filled blocks (Village 0–1 / Town 2–4 / City 5–8 / Metropolis 9+)
//   - Consumption: Village 1 / Town 2 / City 4 / Metropolis 6, modified by
//     sewer system (-1), stockyard present (-1), mill on water (-1)
//   - Max item bonus: Village/Town +1, City +2, Metropolis +3
//   - Influence: Village 0 / Town 1 / City 2 / Metropolis 3 hexes
//   - Items: each tradition stacks up to +3 from buildings (caps independent
//     per tradition). Divine sources (shrine/temple/cathedral) DON'T stack
//     across tier — highest tier wins.
//   - Activity bonuses: per spreadsheet, multiple buildings granting the
//     same bonus do NOT stack — the highest single bonus wins.
//
// Population (per Player's Guide): residential lots × population-per-lot
//   based on settlement type. We use the spreadsheet's interpretation:
//   ~250 per residential lot for villages, scaling up for towns/cities.

import { BUILDINGS } from './buildings';
import {
  GRID_BLOCKS_PER_SIDE,
  LOTS_PER_BLOCK_SIDE,
  TOTAL_BLOCKS,
  TOTAL_LOTS,
  ACTIVITY_LABELS,
  ITEM_TRADITION_LABELS,
  lotsInSameBlock,
  lotIsOnWaterBorder,
  type SettlementState,
  type KingdomState,
  type BuildingMetadata,
  type Activity,
  type ItemTradition,
} from './types';

export type SettlementType = 'Village' | 'Town' | 'City' | 'Metropolis';

export interface BuildingCount {
  id: string;
  name: string;
  count: number;
  meta: BuildingMetadata;
}

export interface ActivityBonusEntry {
  activity: Activity;
  label: string;
  bonus: number;
  /** All buildings that contribute to this bonus (may be more than the winner). */
  sources: string[];
}

export interface SettlementSummary {
  type: SettlementType;
  /** Settlement level (filled blocks). */
  level: number;
  /** Kingdom level (carried through from the parent kingdom). */
  kingdomLevel: number;
  filledBlocks: number;
  filledLots: number;
  /** Lots filled by something other than rubble. */
  realLots: number;
  /** Filled lots whose building counts as Residential. */
  residentialLots: number;
  /** Estimated population count. */
  population: { min: number; max: number };
  consumption: number;
  consumptionBreakdown: { label: string; value: number }[];
  maxItemBonus: number;
  influenceHexes: number;
  /** True if the grid has more lots filled than the settlement type allows. */
  overcrowded: boolean;
  buildings: BuildingCount[];
  /** Effective item levels by tradition (settlement level + best stacking). */
  itemLevels: Record<ItemTradition, { level: number; offset: number; sources: string[] }>;
  /** Activity-bonus matrix (highest-wins per activity). */
  activityBonuses: ActivityBonusEntry[];
  warnings: string[];
  capacityBonuses: { food: number; lumber: number; ore: number; stone: number; luxuries: number };
  /** True if Capital seat building (Castle/Palace/Town Hall) → 3 Leadership activities/turn. */
  hasCapitalSeat: boolean;
}

// =============================================================
// Compute
// =============================================================

export function computeSettlementSummary(state: SettlementState, kingdom?: KingdomState): SettlementSummary {
  // ---- Lot occupancy ----
  const lotToPlacement = new Map<number, { buildingId: string; placementId: string }>();
  for (const p of state.placements) {
    for (const lot of p.lots) lotToPlacement.set(lot, { buildingId: p.buildingId, placementId: p.id });
  }

  let filledLots = 0;
  let realLots = 0;
  let residentialLots = 0;
  for (const [, info] of lotToPlacement) {
    filledLots++;
    if (info.buildingId !== 'rubble') realLots++;
    if (BUILDINGS[info.buildingId]?.residential) residentialLots++;
  }

  // Filled blocks
  let filledBlocks = 0;
  for (let b = 0; b < TOTAL_BLOCKS; b++) {
    const blockLots = blockLots4(b);
    let count = 0;
    for (const l of blockLots) if (lotToPlacement.has(l)) count++;
    if (count === blockLots.length) filledBlocks++;
  }

  const type = settlementType(filledBlocks);
  const level = filledBlocks; // settlement level = filled blocks
  const maxItemBonus = type === 'City' ? 2 : type === 'Metropolis' ? 3 : 1;
  const influenceHexes = type === 'Village' ? 0 : type === 'Town' ? 1 : type === 'City' ? 2 : 3;

  // Overcrowding check (per the spreadsheet):
  //   Village max 4 lots (1 block)
  //   Town    max 16 lots (4 blocks)
  //   City    max 32 lots (8 blocks)
  //   Metropolis: 36+ (one full grid here)
  const lotCap = type === 'Village' ? 4 : type === 'Town' ? 16 : type === 'City' ? 32 : 36;
  const overcrowded = filledLots > lotCap;

  // ---- Buildings count ----
  const counts = new Map<string, number>();
  for (const p of state.placements) counts.set(p.buildingId, (counts.get(p.buildingId) ?? 0) + 1);
  const buildings: BuildingCount[] = [];
  for (const [id, count] of counts) {
    const meta = BUILDINGS[id];
    if (!meta) continue;
    buildings.push({ id, name: meta.name, count, meta });
  }
  buildings.sort((a, b) => a.name.localeCompare(b.name));

  // ---- Consumption ----
  const baseConsumption = type === 'Village' ? 1 : type === 'Town' ? 2 : type === 'City' ? 4 : 6;
  const consumptionBreakdown: { label: string; value: number }[] = [
    { label: `${type} base`, value: baseConsumption },
  ];
  if (state.infrastructure.sewerSystem) consumptionBreakdown.push({ label: 'Sewer System', value: -1 });
  if (counts.get('stockyard')) consumptionBreakdown.push({ label: 'Stockyard', value: -1 });
  const millOnWater = state.placements.some(
    p => p.buildingId === 'mill' && p.lots.some(l => lotIsOnWaterBorder(l, state)),
  );
  if (millOnWater) consumptionBreakdown.push({ label: 'Mill on water', value: -1 });
  const consumption = Math.max(0, consumptionBreakdown.reduce((s, x) => s + x.value, 0));

  // ---- Capacity bonuses ----
  const capacityBonuses = {
    food: counts.get('granary') ?? 0,
    lumber: counts.get('lumberyard') ?? 0,
    ore: counts.get('foundry') ?? 0,
    stone: counts.get('stonemason') ?? 0,
    luxuries: counts.get('securewarehouse') ?? 0,
  };

  // ---- Population estimate ----
  // From the Player's Guide settlement type table:
  //   Village 400-1500 (4 lots)      → 100-375 per lot
  //   Town 1500-5000 (16 lots)        → 94-313 per lot
  //   City 5000-25000 (32 lots)       → 156-781 per lot
  //   Metropolis 25000+ (36+)         → 695+
  // We use the residential-lots count as the population driver.
  const popPerLot = popPerLotForType(type);
  const population = {
    min: residentialLots * popPerLot.min,
    max: residentialLots * popPerLot.max,
  };

  // ---- Item levels by tradition ----
  // Each building contributes to specific traditions per its `traditionBonuses`.
  // Cap at +3 per tradition. Divine sources don't stack across tier (cathedral > temple > shrine).
  const itemLevels = computeItemLevels(level, counts);

  // ---- Activity bonuses (highest-wins) ----
  const activityBonuses = computeActivityBonuses(counts);

  // ---- Capital seat ----
  const hasCapitalSeat =
    state.isCapital && (counts.get('palace') !== undefined || counts.get('castle') !== undefined || counts.get('townhall') !== undefined);

  // ---- Warnings ----
  const warnings: string[] = [];

  // Kingdom level: structures must be ≤ kingdom level
  if (kingdom) {
    for (const p of state.placements) {
      const meta = BUILDINGS[p.buildingId];
      if (!meta) continue;
      if (meta.level > kingdom.level) {
        warnings.push(`${meta.name} (Lvl ${meta.level}) exceeds kingdom level ${kingdom.level}.`);
      }
    }
  }

  // Water-required placements
  for (const p of state.placements) {
    const meta = BUILDINGS[p.buildingId];
    if (!meta) continue;
    const requiresWater = p.buildingId === 'pier' || p.buildingId === 'lumberyard' || p.buildingId === 'waterfront';
    if (requiresWater && !p.lots.some(l => lotIsOnWaterBorder(l, state))) {
      warnings.push(`${meta.name} must be built on a lot adjacent to a Water border.`);
    }
  }

  // Tannery / foundry / dump cannot share block with Residential
  for (const p of state.placements) {
    if (p.buildingId !== 'tannery' && p.buildingId !== 'foundry' && p.buildingId !== 'dump') continue;
    for (const lot of p.lots) {
      const blockSiblings = lotsInSameBlock(lot);
      for (const sibLot of blockSiblings) {
        const sib = lotToPlacement.get(sibLot);
        if (!sib || sib.placementId === p.id) continue;
        const sibMeta = BUILDINGS[sib.buildingId];
        if (!sibMeta) continue;
        if (!sibMeta.residential) continue;
        if (p.buildingId === 'tannery' && sib.buildingId === 'tenement') continue;
        warnings.push(`${BUILDINGS[p.buildingId].name} cannot share a block with ${sibMeta.name} (Residential).`);
      }
    }
  }

  // Luxury Store needs mansion or noble villa in same block
  for (const p of state.placements) {
    if (p.buildingId !== 'luxurystore') continue;
    const blockSiblings = lotsInSameBlock(p.lots[0]);
    const hasNoble = blockSiblings.some(sl => {
      const sib = lotToPlacement.get(sl);
      return sib && (sib.buildingId === 'mansion' || sib.buildingId === 'noblevilla');
    });
    if (!hasNoble) warnings.push(`Luxury Store must share a block with a Mansion or Noble Villa.`);
  }

  // No General Store / Marketplace
  if (!counts.get('generalstore') && !counts.get('marketplace') && state.placements.length > 0) {
    warnings.push('Settlement has no General Store or Marketplace — purchase level −2.');
  }

  if (overcrowded) {
    warnings.push(`Overcrowded: settlement has ${filledLots} lots, ${type} cap is ${lotCap}. +1 Unrest/turn.`);
  }

  // Palace: capital only
  if (counts.get('palace') && !state.isCapital) {
    warnings.push('Palace must be built in your capital settlement.');
  }

  return {
    type,
    level,
    kingdomLevel: kingdom?.level ?? 1,
    filledBlocks,
    filledLots,
    realLots,
    residentialLots,
    population,
    consumption,
    consumptionBreakdown,
    maxItemBonus,
    influenceHexes,
    overcrowded,
    buildings,
    itemLevels,
    activityBonuses,
    warnings: Array.from(new Set(warnings)),
    capacityBonuses,
    hasCapitalSeat,
  };
}

// =============================================================
// Helpers
// =============================================================

function settlementType(filledBlocks: number): SettlementType {
  if (filledBlocks >= 9) return 'Metropolis';
  if (filledBlocks >= 5) return 'City';
  if (filledBlocks >= 2) return 'Town';
  return 'Village';
}

function popPerLotForType(t: SettlementType): { min: number; max: number } {
  switch (t) {
    case 'Village': return { min: 100, max: 375 };
    case 'Town': return { min: 94, max: 313 };
    case 'City': return { min: 156, max: 781 };
    case 'Metropolis': return { min: 695, max: 1500 };
  }
}

function blockLots4(blockIndex: number): number[] {
  const blockCol = blockIndex % GRID_BLOCKS_PER_SIDE;
  const blockRow = Math.floor(blockIndex / GRID_BLOCKS_PER_SIDE);
  const startCol = blockCol * LOTS_PER_BLOCK_SIDE;
  const startRow = blockRow * LOTS_PER_BLOCK_SIDE;
  const out: number[] = [];
  for (let dr = 0; dr < LOTS_PER_BLOCK_SIDE; dr++) {
    for (let dc = 0; dc < LOTS_PER_BLOCK_SIDE; dc++) {
      out.push((startRow + dr) * (GRID_BLOCKS_PER_SIDE * LOTS_PER_BLOCK_SIDE) + (startCol + dc));
    }
  }
  return out;
}

/**
 * Compute per-tradition item-level offsets, with stacking caps.
 * Each "+1 to <tradition>" building stacks up to 3× per tradition.
 * Divine sources (shrine/temple/cathedral) follow special rules:
 *   - Cathedral always grants +3 (regardless of count, doesn't stack with others)
 *   - Otherwise shrine and temple each stack within their own type up to +3
 *   - Highest tier wins (cathedral > temple > shrine)
 *   - These do not stack with each other.
 *
 * Other traditions: simple count-up-to-3 from each contributing building.
 */
function computeItemLevels(
  baseLevel: number,
  counts: Map<string, number>,
): Record<ItemTradition, { level: number; offset: number; sources: string[] }> {
  const result: Record<ItemTradition, { level: number; offset: number; sources: string[] }> = {
    base: { level: baseLevel, offset: 0, sources: [] },
    alchemical: { level: baseLevel, offset: 0, sources: [] },
    arcane: { level: baseLevel, offset: 0, sources: [] },
    divine: { level: baseLevel, offset: 0, sources: [] },
    primal: { level: baseLevel, offset: 0, sources: [] },
    luxurious: { level: baseLevel, offset: 0, sources: [] },
  };

  // Generic stacking — for each building with traditionBonuses, add bonus × count, capped at 3.
  // We aggregate per-tradition contributions.
  const contributions: Record<ItemTradition, Map<string, number>> = {
    base: new Map(),
    alchemical: new Map(),
    arcane: new Map(),
    divine: new Map(),
    primal: new Map(),
    luxurious: new Map(),
  };

  for (const [bid, count] of counts) {
    const meta = BUILDINGS[bid];
    if (!meta?.traditionBonuses) continue;
    for (const [trad, bonus] of Object.entries(meta.traditionBonuses)) {
      if (typeof bonus !== 'number') continue;
      contributions[trad as ItemTradition].set(bid, count * bonus);
    }
  }

  // Divine special-case: cathedral overrides, otherwise highest-tier-stacks-only-in-its-tier.
  const divineCount = {
    cathedral: counts.get('cathedral') ?? 0,
    temple: counts.get('temple') ?? 0,
    shrine: counts.get('shrine') ?? 0,
  };
  if (divineCount.cathedral > 0) {
    result.divine.offset = 3;
    result.divine.sources = ['cathedral'];
  } else if (divineCount.temple > 0) {
    result.divine.offset = Math.min(3, divineCount.temple);
    result.divine.sources = ['temple'];
  } else if (divineCount.shrine > 0) {
    result.divine.offset = Math.min(3, divineCount.shrine);
    result.divine.sources = ['shrine'];
  }

  // For all other traditions, sum contributions, cap at 3.
  for (const trad of ['base', 'alchemical', 'arcane', 'primal', 'luxurious'] as const) {
    let total = 0;
    const sources: string[] = [];
    for (const [bid, contrib] of contributions[trad]) {
      total += contrib;
      sources.push(bid);
    }
    result[trad].offset = Math.min(3, total);
    result[trad].sources = sources;
  }

  // Compute final levels (base + offset).
  for (const trad of Object.keys(result) as ItemTradition[]) {
    result[trad].level = baseLevel + result[trad].offset;
  }

  // Waterfront: +1 effective level for purchases (applied to base).
  const wf = counts.get('waterfront') ?? 0;
  if (wf > 0) {
    // Already counted via traditionBonuses.base on waterfront; but ensure source
    if (!result.base.sources.includes('waterfront')) result.base.sources.push('waterfront');
  }

  return result;
}

/**
 * Build the activity-bonus matrix. Per Kingmaker rules, item bonuses from
 * different sources DO NOT stack — the highest single bonus wins. We collect
 * all contributing building ids so the player can see what's providing it.
 */
function computeActivityBonuses(counts: Map<string, number>): ActivityBonusEntry[] {
  // activity → highest bonus + all contributing sources at that bonus level
  const map = new Map<Activity, { bonus: number; sources: string[] }>();

  for (const [bid] of counts) {
    const meta = BUILDINGS[bid];
    if (!meta?.itemBonuses) continue;
    for (const ib of meta.itemBonuses) {
      const existing = map.get(ib.activity);
      if (!existing) {
        map.set(ib.activity, { bonus: ib.bonus, sources: [bid] });
      } else if (ib.bonus > existing.bonus) {
        map.set(ib.activity, { bonus: ib.bonus, sources: [bid] });
      } else if (ib.bonus === existing.bonus) {
        existing.sources.push(bid);
      }
    }
  }

  const entries: ActivityBonusEntry[] = [];
  for (const [activity, info] of map) {
    entries.push({
      activity,
      label: ACTIVITY_LABELS[activity] ?? activity,
      bonus: info.bonus,
      sources: info.sources,
    });
  }
  // Sort by bonus desc, then label asc
  entries.sort((a, b) => b.bonus - a.bonus || a.label.localeCompare(b.label));
  return entries;
}

// Re-export for the view
export { ITEM_TRADITION_LABELS, TOTAL_LOTS, TOTAL_BLOCKS };
