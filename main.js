// Smoke test for the v3 summary computation.
// Run with: node tests/run.mjs

import { computeSettlementSummary } from '../src/summary';
import {
  abilityModifier,
  controlDC,
  computeRollup,
  kingdomSize,
  leadershipActivitySlots,
  leadershipStatus,
  nextTurnPhase,
  ruinTotalPenalty,
  skillModifier,
} from '../src/kingdom';
import {
  makeEmptySettlement,
  makeEmptyKingdom,
  migrateKingdom,
  lotIdentifier,
  lotsInSameBlock,
} from '../src/types';

let pass = 0;
let fail = 0;

function expect(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`✓ ${label}`);
  } else {
    fail++;
    console.log(`✗ ${label}: got=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  }
}

// =============================================================
// Test 1: Lot identifier mapping
// =============================================================
console.log('--- Lot identifier sanity ---');
expect('lot 0 → A1', lotIdentifier(0), 'A1');
expect('lot 1 → A2', lotIdentifier(1), 'A2');
expect('lot 6 → A3', lotIdentifier(6), 'A3');
expect('lot 7 → A4', lotIdentifier(7), 'A4');
expect('lot 2 → B1', lotIdentifier(2), 'B1');
expect('lot 35 → I4', lotIdentifier(35), 'I4');

// =============================================================
// Test 2: Empty settlement with kingdom
// =============================================================
console.log('\n--- Empty settlement (kingdom Lvl 5) ---');
const k1 = makeEmptyKingdom('Test Realm');
k1.level = 5;
const s1 = makeEmptySettlement('Hamlet', 'Test Realm');
const r1 = computeSettlementSummary(s1, k1);
expect('type=Village', r1.type, 'Village');
expect('settlement level = 0', r1.level, 0);
expect('kingdom level = 5', r1.kingdomLevel, 5);
expect('residential lots = 0', r1.residentialLots, 0);
expect('population min/max = 0/0', r1.population, { min: 0, max: 0 });

// =============================================================
// Test 3: Town with houses + tavern + alchemy lab + arcanist tower + library
// =============================================================
console.log('\n--- Town: 2 blocks filled with mixed buildings ---');
const k2 = makeEmptyKingdom('Test Realm 2');
k2.level = 8;
const s2 = makeEmptySettlement('Mixedburg', 'Test Realm 2');
const blockA = lotsInSameBlock(0);
for (let i = 0; i < 4; i++) {
  s2.placements.push({ id: `p-h-${i}`, buildingId: 'houses', lots: [blockA[i]] });
}
const blockB = lotsInSameBlock(2);
s2.placements.push({ id: 'p-alch', buildingId: 'alchemylab', lots: [blockB[0]] });
s2.placements.push({ id: 'p-arc', buildingId: 'arcanisttower', lots: [blockB[1]] });
s2.placements.push({ id: 'p-tav', buildingId: 'tavernpopular', lots: [blockB[2]] });
s2.placements.push({ id: 'p-lib', buildingId: 'library', lots: [blockB[3]] });
const r2 = computeSettlementSummary(s2, k2);
expect('type=Town', r2.type, 'Town');
expect('filled blocks = 2', r2.filledBlocks, 2);
expect('filled lots = 8', r2.filledLots, 8);
expect('residential lots = 4 (houses)', r2.residentialLots, 4);
expect('alchemical offset = 1', r2.itemLevels.alchemical.offset, 1);
expect('arcane offset = 1', r2.itemLevels.arcane.offset, 1);
expect('divine offset = 0', r2.itemLevels.divine.offset, 0);
const tavRes = r2.activityBonuses.find(a => a.activity === 'gather-information');
expect('gather-info bonus = +1', tavRes?.bonus, 1);
const libRes = r2.activityBonuses.find(a => a.activity === 'researching');
expect('researching bonus = +1', libRes?.bonus, 1);
console.log(`  population estimate: ${r2.population.min}–${r2.population.max} (4 res lots × 94–313)`);

// =============================================================
// Test 4: Highest-wins for activity bonuses
// =============================================================
console.log('\n--- Activity bonus highest-wins ---');
const k3 = makeEmptyKingdom('Realm');
k3.level = 20;
const s3 = makeEmptySettlement('Wealthy', 'Realm');
const bA = lotsInSameBlock(0);
s3.placements.push({ id: 'p1', buildingId: 'library', lots: [bA[0]] });
s3.placements.push({ id: 'p2', buildingId: 'academy', lots: [bA[1], bA[2]] });
const r3 = computeSettlementSummary(s3, k3);
const research = r3.activityBonuses.find(a => a.activity === 'researching');
expect('researching = +2 (academy wins over library)', research?.bonus, 2);
expect('researching source contains "academy"', research?.sources.includes('academy'), true);
expect('researching source DOES NOT contain "library"', research?.sources.includes('library'), false);

// =============================================================
// Test 5: Divine items — cathedral overrides temple+shrine
// =============================================================
console.log('\n--- Divine: cathedral overrides ---');
const k4 = makeEmptyKingdom('K');
k4.level = 20;
const s4 = makeEmptySettlement('Holy', 'K');
const bA4 = lotsInSameBlock(0);
const bB4 = lotsInSameBlock(2);
s4.placements.push({ id: 'p1', buildingId: 'shrine', lots: [bA4[0]] });
s4.placements.push({ id: 'p2', buildingId: 'temple', lots: [bA4[1], bA4[2]] });
s4.placements.push({ id: 'p3', buildingId: 'cathedral', lots: bB4 });
const r4 = computeSettlementSummary(s4, k4);
expect('divine offset = 3 (cathedral)', r4.itemLevels.divine.offset, 3);
expect('divine sources = [cathedral]', r4.itemLevels.divine.sources, ['cathedral']);

// =============================================================
// Test 6: Kingdom-level violation warning
// =============================================================
console.log('\n--- Over-level structure triggers warning ---');
const k5 = makeEmptyKingdom('Small');
k5.level = 2;
const s5 = makeEmptySettlement('Doomed', 'Small');
s5.placements.push({ id: 'p1', buildingId: 'castle', lots: lotsInSameBlock(0) });
const r5 = computeSettlementSummary(s5, k5);
const hasViolation = r5.warnings.some(w => w.includes('Castle') && w.includes('exceeds kingdom level'));
expect('castle warning present', hasViolation, true);

// =============================================================
// Test 7: Capital seat detection
// =============================================================
console.log('\n--- Capital with town hall = 3 leadership/turn ---');
const k6 = makeEmptyKingdom('Cap');
k6.level = 5;
const s6 = makeEmptySettlement('Capitol', 'Cap');
s6.isCapital = true;
s6.placements.push({ id: 'p1', buildingId: 'townhall', lots: [lotsInSameBlock(0)[0], lotsInSameBlock(0)[1]] });
const r6 = computeSettlementSummary(s6, k6);
expect('hasCapitalSeat = true', r6.hasCapitalSeat, true);
const r6NotCapital = computeSettlementSummary({ ...s6, isCapital: false }, k6);
expect('hasCapitalSeat = false (not capital)', r6NotCapital.hasCapitalSeat, false);

// =============================================================
// v0.5 — KINGDOM SHEET TESTS
// =============================================================

console.log('\n--- Ability modifier ---');
expect('mod(10) = 0', abilityModifier(10), 0);
expect('mod(11) = 0', abilityModifier(11), 0);
expect('mod(12) = +1', abilityModifier(12), 1);
expect('mod(8) = -1', abilityModifier(8), -1);
expect('mod(18) = +4', abilityModifier(18), 4);

console.log('\n--- Skill modifier (level 5, score 14, expert) ---');
const k7 = makeEmptyKingdom('Skilled Realm');
k7.level = 5;
k7.abilities.warfare = 14;
k7.proficiencies.warfare = 'expert';
// expected: mod(14)=+2 + 4 (expert) + 5 (level) = +11
expect('warfare skill = +11', skillModifier(k7, 'warfare'), 11);
// untrained should not get level bonus
k7.abilities.boating = 16;
k7.proficiencies.boating = 'untrained';
// expected: mod(16)=+3 + 0 + 0 = +3
expect('boating skill (untrained) = +3', skillModifier(k7, 'boating'), 3);

console.log('\n--- Kingdom size from claimed hexes ---');
expect('5 hexes = I', kingdomSize(5), 'I');
expect('20 hexes = II', kingdomSize(20), 'II');
expect('40 hexes = III', kingdomSize(40), 'III');
expect('100 hexes = IV', kingdomSize(100), 'IV');

console.log('\n--- Control DC ---');
const k8 = makeEmptyKingdom('Control');
k8.level = 5;
k8.claimedHexes = 5; // size I → 0 mod
// Level 5 base = 20 + 0 size + 0 ruin = 20
expect('Control DC level 5 size I = 20', controlDC(k8), 20);
k8.claimedHexes = 30; // size III → +2
// 20 + 2 = 22
expect('Control DC level 5 size III = 22', controlDC(k8), 22);
k8.ruin.corruption.penalty = 1;
expect('Control DC level 5 size III + 1 ruin penalty = 23', controlDC(k8), 23);

console.log('\n--- Ruin total penalty ---');
const k9 = makeEmptyKingdom('Ruined');
k9.ruin.corruption.penalty = 1;
k9.ruin.crime.penalty = 2;
k9.ruin.decay.penalty = 0;
k9.ruin.strife.penalty = 1;
expect('Total ruin penalty = 4', ruinTotalPenalty(k9), 4);

console.log('\n--- Leadership status ---');
const k10 = makeEmptyKingdom('Realm');
k10.leadership[0] = { role: 'ruler', name: 'Queen Beth', isPC: true, invested: true };
k10.leadership[1] = { role: 'counselor', name: 'Old Sage', isPC: false, invested: false };
const lstat = leadershipStatus(k10);
expect('1 PC leader', lstat.pcRoles.length, 1);
expect('2 filled', lstat.filledRoles.length, 2);
expect('9 vacant', lstat.vacantRoles.length, 9);
expect('1 uninvested (counselor)', lstat.uninvestedRoles.length, 1);

console.log('\n--- Leadership activity slots ---');
// Default: 2 + 1 PC = 3, no capital seat
expect('3 slots (2 PC + base 2 + no seat)', leadershipActivitySlots(k10, []), 3);

// Add a capital with castle
const sCap = makeEmptySettlement('Capitol', 'Realm');
sCap.isCapital = true;
sCap.placements.push({ id: 'p1', buildingId: 'castle', lots: lotsInSameBlock(0) });
expect('4 slots (with capital seat)', leadershipActivitySlots(k10, [sCap]), 4);

console.log('\n--- Turn phase advance ---');
expect('upkeep → commerce', nextTurnPhase('upkeep'), { phase: 'commerce', advancesTurn: false });
expect('civic → upkeep advances turn', nextTurnPhase('civic'), { phase: 'upkeep', advancesTurn: true });

console.log('\n--- Cross-settlement roll-up ---');
const krollup = makeEmptyKingdom('Big Realm');
krollup.level = 10;

// Settlement 1: Capital with cathedral (divine +3, but only 1 block filled so settlement level 1)
const s1Roll = makeEmptySettlement('Capital', 'Big Realm');
s1Roll.isCapital = true;
s1Roll.placements.push({ id: 'p1', buildingId: 'cathedral', lots: lotsInSameBlock(0) });

// Settlement 2: Has alchemy lab + arcanist tower + 2 fillers (full block).
// Settlement level = 1 (1 filled block); alchemical offset +1 → 2.
const s2Roll = makeEmptySettlement('Magic Town', 'Big Realm');
const blockA2 = lotsInSameBlock(0);
s2Roll.placements.push({ id: 'p1', buildingId: 'alchemylab', lots: [blockA2[0]] });
s2Roll.placements.push({ id: 'p2', buildingId: 'arcanisttower', lots: [blockA2[1]] });
s2Roll.placements.push({ id: 'p3', buildingId: 'shrine', lots: [blockA2[2]] });
s2Roll.placements.push({ id: 'p4', buildingId: 'inn', lots: [blockA2[3]] });

// Settlement 3: Different kingdom — should not be included
const s3Other = makeEmptySettlement('Other', 'Some Other Kingdom');

const rollup = computeRollup(krollup, [s1Roll, s2Roll, s3Other]);
expect('rollup includes 2 settlements (filters by kingdom)', rollup.settlements.length, 2);
expect('rollup capital name = "Capital"', rollup.capitalName, 'Capital');
expect('rollup countByType.Village = 2', rollup.countByType.Village, 2);
// Cathedral on settlement-level-1 capital: 1 + 3 = 4
expect('rollup best divine level = 4 from Capital', rollup.bestItemLevels.divine, { level: 4, settlementName: 'Capital' });
// Magic Town has alchemical offset +1 on settlement level 1 → 2; Capital has 1+0=1
expect('rollup best alchemical level = 2 from Magic Town', rollup.bestItemLevels.alchemical, { level: 2, settlementName: 'Magic Town' });

console.log('\n--- Kingdom migration (legacy partial save) ---');
const legacy: any = {
  name: 'Old Save',
  level: 4,
  stockpiles: { rp: 5, food: 2, lumber: 1, luxuries: 0, ore: 0, stone: 0 },
};
const migrated = migrateKingdom(legacy);
expect('migrated has all 16 abilities', Object.keys(migrated.abilities).length, 16);
expect('migrated has 11 leadership roles', migrated.leadership.length, 11);
expect('migrated preserved level', migrated.level, 4);
expect('migrated preserved stockpiles.rp', migrated.stockpiles.rp, 5);
expect('migrated has turn record', migrated.turn.number, 1);
expect('migrated has ruin tracks', Object.keys(migrated.ruin).length, 4);
expect('migrated has empty hexes map', Object.keys(migrated.hexes).length, 0);

// =============================================================
// Hex map: geometry
// =============================================================
import { axialToPixel, pixelToAxial, neighbor, hexDistance, ensureHex, toggleRoad, visibleHexes, computeHexMapSummary } from '../src/hex';
import { hexKey } from '../src/types';

console.log('\n--- Hex geometry ---');
// Origin should land at (0, 0)
const p0 = axialToPixel(0, 0);
expect('axialToPixel(0,0) → (0,0)', { x: Math.round(p0.x), y: Math.round(p0.y) }, { x: 0, y: 0 });

// Round-trip a few coords
for (const [q, r] of [[1, 0], [0, 1], [-2, 1], [3, -1]] as [number, number][]) {
  const p = axialToPixel(q, r);
  const back = pixelToAxial(p.x, p.y);
  expect(`round-trip (${q},${r})`, back, { q, r });
}

// Neighbours
expect('neighbor(0,0,1) (E)', neighbor(0, 0, 1), { q: 1, r: 0 });
expect('neighbor(0,0,3) (SW)', neighbor(0, 0, 3), { q: -1, r: 1 });

// Distance
expect('hexDistance((0,0),(0,0)) = 0', hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 }), 0);
expect('hexDistance((0,0),(2,0)) = 2', hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 }), 2);
expect('hexDistance((0,0),(2,-1)) = 2', hexDistance({ q: 0, r: 0 }, { q: 2, r: -1 }), 2);
expect('hexDistance((0,0),(3,-2)) = 3', hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 }), 3);

// =============================================================
// Hex map: ensureHex / toggleRoad
// =============================================================
console.log('\n--- Hex state mutation ---');
const khex1 = makeEmptyKingdom('Hex realm');
const h00 = ensureHex(khex1, 0, 0);
h00.claimed = true;
h00.terrain = 'forest';
h00.worksite = 'lumber-camp';
expect('after ensureHex, key exists', !!khex1.hexes[hexKey(0, 0)], true);
expect('hex has terrain forest', khex1.hexes[hexKey(0, 0)].terrain, 'forest');

// toggleRoad mirrors on neighbour
toggleRoad(khex1, 0, 0, 1); // edge E
expect('road on (0,0) edge 1 set', khex1.hexes[hexKey(0, 0)].roads[1], true);
expect('road on (1,0) edge 4 (mirror) set', khex1.hexes[hexKey(1, 0)].roads[4], true);
toggleRoad(khex1, 0, 0, 1); // toggle off
expect('road on (0,0) edge 1 cleared', khex1.hexes[hexKey(0, 0)].roads[1], false);
expect('road on (1,0) edge 4 cleared (mirror)', khex1.hexes[hexKey(1, 0)].roads[4], false);

// =============================================================
// Hex map: visibleHexes seeds blank-canvas grid
// =============================================================
console.log('\n--- visibleHexes ---');
const khex2 = makeEmptyKingdom('Empty');
const seeded = visibleHexes(khex2);
expect('blank kingdom seeds a non-empty grid', seeded.length > 5, true);

// Once a hex is claimed, ghost-neighbours should appear
const khex3 = makeEmptyKingdom('One claim');
const c = ensureHex(khex3, 0, 0);
c.claimed = true;
const khex3view = visibleHexes(khex3);
// Should be 1 claimed + 6 ghost neighbours = 7
expect('one claim + 6 ghosts = 7 visible', khex3view.length, 7);
expect('claimed hex present', khex3view.some(h => h.claimed && h.q === 0 && h.r === 0), true);

// =============================================================
// Hex map: summary
// =============================================================
console.log('\n--- Hex map summary ---');
const khex4 = makeEmptyKingdom('Realm');
const ha = ensureHex(khex4, 0, 0); ha.claimed = true; ha.terrain = 'plains';
const hb = ensureHex(khex4, 1, 0); hb.claimed = true; hb.terrain = 'forest'; hb.worksite = 'lumber-camp';
const hc = ensureHex(khex4, 2, 0); hc.claimed = true; hc.terrain = 'mountains'; hc.worksite = 'mine';
const hd = ensureHex(khex4, 0, 1); hd.claimed = true; hd.terrain = 'plains'; hd.worksite = 'mine'; // INVALID
toggleRoad(khex4, 0, 0, 1);
const sum = computeHexMapSummary(khex4, {});
expect('summary claimed = 4', sum.claimed, 4);
expect('summary plains = 2', sum.terrainCounts.plains, 2);
expect('summary forest = 1', sum.terrainCounts.forest, 1);
expect('summary lumber-camp = 1', sum.worksiteCounts['lumber-camp'], 1);
expect('summary mine = 2', sum.worksiteCounts.mine, 2);
expect('summary detects invalid worksite', sum.invalidWorksites.length, 1);
expect('invalid worksite is at (0,1)', sum.invalidWorksites[0].q === 0 && sum.invalidWorksites[0].r === 1, true);
expect('one road edge', sum.roadEdges, 1);

// =============================================================
// Activity engine
// =============================================================
import {
  legalActivitiesFor,
  computeActivityCheck,
  classifyOutcome,
  rollActivity,
  applyAttempt,
} from '../src/kingdom';
import { ACTIVITY_BY_ID } from '../src/activities';

console.log('\n--- Activity engine: outcome classification ---');
expect('total >= DC+10 → critical-success', classifyOutcome(25, 15, 10), 'critical-success');
expect('total >= DC → success', classifyOutcome(20, 15, 10), 'success');
expect('total >= DC-10 → failure', classifyOutcome(10, 15, 10), 'failure');
expect('total < DC-10 → critical-failure', classifyOutcome(0, 15, 5), 'critical-failure');
// Nat 20 bumps tier up
expect('nat 20 bumps failure → success', classifyOutcome(10, 15, 20), 'success');
expect('nat 20 from crit-success stays crit-success', classifyOutcome(30, 15, 20), 'critical-success');
// Nat 1 bumps tier down
expect('nat 1 bumps success → failure', classifyOutcome(20, 15, 1), 'failure');
expect('nat 1 from crit-failure stays crit-failure', classifyOutcome(0, 15, 1), 'critical-failure');

console.log('\n--- Activity engine: legalActivitiesFor ---');
const kAct = makeEmptyKingdom('Activity Realm');
kAct.level = 5;
kAct.turn.phase = 'leadership';
// Fill ruler so we can attempt new-leadership
const rulerSlot = kAct.leadership.find(l => l.role === 'ruler')!;
rulerSlot.name = 'Queen Talia';
rulerSlot.invested = true;
const legal = legalActivitiesFor(kAct, [], 'leadership');
const newLeadership = legal.find(i => i.entry.id === 'new-leadership');
expect('new-leadership exists in catalogue', !!newLeadership, true);
expect('new-leadership is legal (ruler filled)', newLeadership?.legal, true);
expect('new-leadership leader name = Queen Talia', newLeadership?.leaderName, 'Queen Talia');

// Now blank the ruler — should become illegal
rulerSlot.name = '';
const legal2 = legalActivitiesFor(kAct, [], 'leadership');
const newLeadership2 = legal2.find(i => i.entry.id === 'new-leadership');
expect('new-leadership becomes illegal when ruler vacant', newLeadership2?.legal, false);

// Capital-investment requires a Bank somewhere
rulerSlot.name = 'Queen Talia';
const treasurerSlot = kAct.leadership.find(l => l.role === 'treasurer')!;
treasurerSlot.name = 'Master Voll';
treasurerSlot.invested = true;
kAct.turn.phase = 'commerce';
const settlementWithoutBank = makeEmptySettlement('Test', 'Activity Realm');
const legalCom = legalActivitiesFor(kAct, [settlementWithoutBank], 'commerce');
const capInv = legalCom.find(i => i.entry.id === 'capital-investment');
expect('capital-investment illegal without bank', capInv?.legal, false);
expect('capital-investment reason mentions bank', capInv?.blockedReasons.some(r => r.toLowerCase().includes('bank')), true);

// Add a bank
settlementWithoutBank.placements.push({ id: 'p1', buildingId: 'bank', lots: [0] });
const legalCom2 = legalActivitiesFor(kAct, [settlementWithoutBank], 'commerce');
const capInv2 = legalCom2.find(i => i.entry.id === 'capital-investment');
expect('capital-investment legal with bank', capInv2?.legal, true);

console.log('\n--- Activity engine: computeActivityCheck ---');
kAct.abilities.trade = 16; // +3
kAct.proficiencies.trade = 'expert'; // prof +4, +level 5 if trained
const ent = ACTIVITY_BY_ID['collect-taxes'];
const check = computeActivityCheck(kAct, [settlementWithoutBank], ent);
// modifier = 3 (mod) + 4 (expert) + 5 (level) - 0 (ruin) = 12, no item bonus from a bank-only settlement
expect('collect-taxes modifier breakdown', check.modifier, 12);
expect('collect-taxes DC = control DC', check.dc, controlDC(kAct));

console.log('\n--- Activity engine: rollActivity + applyAttempt ---');
const ent2 = ACTIVITY_BY_ID['collect-taxes'];
// Force a known outcome by rolling and accepting
const att = rollActivity(kAct, [settlementWithoutBank], ent2);
expect('rollActivity returns d20 in [1,20]', att.d20 >= 1 && att.d20 <= 20, true);
expect('rollActivity total = d20 + modifier', att.total, att.d20 + att.modifier);
expect('rollActivity DC matches kingdom', att.dc, controlDC(kAct));

// Force critical-success and apply
att.outcome = 'critical-success';
att.overridden = true;
const rpBefore = kAct.stockpiles.rp;
applyAttempt(kAct, att);
expect('crit-success applied: RP +4', kAct.stockpiles.rp - rpBefore, 4);
expect('attempt logged to turn.attempts', kAct.turn.attempts?.length, 1);
expect('attempt logged to events', kAct.events.length >= 1, true);

// =============================================================
// Army roster engine
// =============================================================
import {
  baseStatsFor,
  tacticsAvailableFor,
  tacticSlotsForLevel,
  gearAvailableFor,
  makeArmy,
} from '../src/armies';
import {
  computeArmyRosterSummary,
  recruitArmyForKingdom,
  trainArmy,
  garrisonArmy,
  deployArmy,
  recoverArmy,
  disbandArmy,
} from '../src/kingdom';

console.log('\n--- Army base stats ---');
const inf5 = baseStatsFor(5, 'infantry');
const cav5 = baseStatsFor(5, 'cavalry');
expect('infantry lvl5 has higher HP than cavalry lvl5', inf5.hp > cav5.hp, true);
expect('cavalry has +1 attack over baseline', cav5.attackMod, 5 + 4 + 1);

console.log('\n--- Tactic slots ---');
expect('tacticSlotsForLevel(1) = 1', tacticSlotsForLevel(1), 1);
expect('tacticSlotsForLevel(3) = 2', tacticSlotsForLevel(3), 2);
expect('tacticSlotsForLevel(5) = 3', tacticSlotsForLevel(5), 3);
expect('tacticSlotsForLevel(19) = 10', tacticSlotsForLevel(19), 10);

console.log('\n--- Tactics available ---');
const cavLvl3 = tacticsAvailableFor(3, 'cavalry');
const infLvl3 = tacticsAvailableFor(3, 'infantry');
const holdLine = infLvl3.find(t => t.id === 'hold-the-line');
const holdLineForCav = cavLvl3.find(t => t.id === 'hold-the-line');
expect('Hold the Line available to infantry', !!holdLine, true);
expect('Hold the Line NOT available to cavalry', !!holdLineForCav, false);
const cavExperts = cavLvl3.find(t => t.id === 'cavalry-experts');
expect('Cavalry Experts available to cavalry at lvl 3', !!cavExperts, true);

console.log('\n--- Gear available ---');
const gearLvl1 = gearAvailableFor(1, 'armour');
expect('Field Armor available at lvl 1', gearLvl1.some(g => g.id === 'field-armor'), true);
expect('Heavy Armor NOT available at lvl 1', gearLvl1.some(g => g.id === 'heavy-armor'), false);

console.log('\n--- Recruit / Train / Garrison / Recover ---');
const kArm = makeEmptyKingdom('Realm of Arms');
kArm.level = 5;
const a1 = recruitArmyForKingdom(kArm, 'Stetven Pikes', 5, 'infantry', false);
expect('army added to roster', !!kArm.armies[a1.id], true);
expect('army at full HP on creation', a1.hp, a1.maxHp);
expect('army starts mobilized', a1.status, 'mobilized');

const oldMax = a1.maxHp;
trainArmy(a1, 1);
expect('train: level +1', a1.level, 6);
expect('train: maxHp recomputed', a1.maxHp > oldMax, true);

garrisonArmy(a1, 'settlement-id-x');
expect('garrison: status garrisoned', a1.status, 'garrisoned');
expect('garrison: adds Fortified', a1.conditions.includes('fortified'), true);

deployArmy(a1, '0,0');
expect('deploy: status mobilized', a1.status, 'mobilized');
expect('deploy: removes Fortified', a1.conditions.includes('fortified'), false);

a1.hp = 1; // injure
a1.conditions = ['fatigued', 'shaken'];
recoverArmy(a1, false);
expect('recover (partial): hp increased', a1.hp > 1, true);
expect('recover (partial): fatigued cleared', a1.conditions.includes('fatigued'), false);

a1.hp = 5;
recoverArmy(a1, true);
expect('recover (full): hp = maxHp', a1.hp, a1.maxHp);
expect('recover (full): status mobilized', a1.status, 'mobilized');

disbandArmy(a1);
expect('disband: status disbanded', a1.status, 'disbanded');
expect('disband: hp 0', a1.hp, 0);

console.log('\n--- Roster summary ---');
const kArm2 = makeEmptyKingdom('Defensive');
kArm2.level = 3;
const ax = recruitArmyForKingdom(kArm2, 'Alpha', 3, 'infantry', false);
const ay = recruitArmyForKingdom(kArm2, 'Beta', 3, 'cavalry', false);
ay.hp = 2; // low HP
ay.status = 'defeated';
const sumA = computeArmyRosterSummary(kArm2);
expect('summary total = 2', sumA.total, 2);
expect('summary defeated = 1', sumA.byStatus.defeated, 1);
expect('summary mobilized = 1', sumA.byStatus.mobilized, 1);
expect('summary warnings include defeated', sumA.warnings.some(w => w.includes('defeated')), true);

console.log('\n--- Activity engine: Recruit Army auto-creates ---');
const kArm3 = makeEmptyKingdom('Test Recruit');
kArm3.level = 4;
kArm3.turn.phase = 'leadership';
const generalSlot = kArm3.leadership.find(l => l.role === 'general')!;
generalSlot.name = 'General X';
generalSlot.invested = true;
const recruitEntry = ACTIVITY_BY_ID['recruit-army'];
const recAttempt = rollActivity(kArm3, [], recruitEntry);
recAttempt.outcome = 'success';
recAttempt.overridden = true;
const beforeCount = Object.keys(kArm3.armies).length;
applyAttempt(kArm3, recAttempt);
expect('recruit-army success creates new army', Object.keys(kArm3.armies).length, beforeCount + 1);

// =============================================================
// Event engine
// =============================================================
import {
  triggerEventInstance,
  attemptEventResolution,
  applyEventResolution,
  tickContinuousEvents,
  dismissEventInstance,
  deleteEventInstance,
  computeEventSummary,
} from '../src/kingdom';
import { EVENTS, EVENT_BY_ID, rollEventTable } from '../src/events';

console.log('\n--- Event catalogue ---');
expect('catalogue has at least 15 events', EVENTS.length >= 15, true);
expect('Bandit Activity exists', !!EVENT_BY_ID['bandit-activity'], true);
expect('Bandit Activity is continuous', EVENT_BY_ID['bandit-activity'].kind, 'continuous');
expect('Diplomatic Overture is beneficial', EVENT_BY_ID['diplomatic-overture'].kind, 'beneficial');
expect('Natural Disaster is oneshot', EVENT_BY_ID['natural-disaster'].kind, 'oneshot');

console.log('\n--- rollEventTable ---');
const rolled = rollEventTable(() => 0); // First entry
expect('rollEventTable returns valid event', !!rolled.id, true);
expect('rollEventTable result has name', typeof rolled.name, 'string');

console.log('\n--- triggerEventInstance ---');
const kEv = makeEmptyKingdom('Event Realm');
kEv.level = 5;
kEv.turn.number = 3;
const inst1 = triggerEventInstance(kEv, 'bandit-activity');
expect('event instance added to kingdom', !!kEv.eventInstances[inst1.id], true);
expect('instance starts active', inst1.status, 'active');
expect('instance startTurn = current turn', inst1.startTurn, 3);
expect('event logged to events array', kEv.events.length >= 1, true);

console.log('\n--- attemptEventResolution ---');
const att1 = attemptEventResolution(kEv, inst1, 'warfare');
expect('attempt has d20 in [1,20]', att1.d20 >= 1 && att1.d20 <= 20, true);
expect('attempt total = d20 + modifier', att1.total, att1.d20 + att1.modifier);
// dc = controlDC + dcModifier(0)
expect('attempt dc matches controlDC', att1.dc, controlDC(kEv));

console.log('\n--- applyEventResolution: continuous + critical-success resolves ---');
att1.outcome = 'critical-success';
att1.overridden = true;
const fameBefore = kEv.fame;
applyEventResolution(kEv, inst1, att1);
expect('event status = resolved', inst1.status, 'resolved');
expect('event delta applied (fame +1)', kEv.fame - fameBefore, 1);
expect('attempt added to instance history', inst1.attempts.length, 1);

console.log('\n--- applyEventResolution: continuous + critical-failure worsens ---');
const inst2 = triggerEventInstance(kEv, 'plague');
const att2 = attemptEventResolution(kEv, inst2, 'defense');
att2.outcome = 'critical-failure';
att2.overridden = true;
applyEventResolution(kEv, inst2, att2);
expect('plague crit-failure → worsened', inst2.status, 'worsened');
expect('plague dcModifier += 2', inst2.dcModifier, 2);

console.log('\n--- applyEventResolution: oneshot + failure → failed ---');
const inst3 = triggerEventInstance(kEv, 'natural-disaster');
const att3 = attemptEventResolution(kEv, inst3, 'engineering');
att3.outcome = 'failure';
att3.overridden = true;
applyEventResolution(kEv, inst3, att3);
expect('natural-disaster failure → failed', inst3.status, 'failed');

console.log('\n--- applyEventResolution: oneshot + success → resolved ---');
const inst4 = triggerEventInstance(kEv, 'visiting-celebrity');
const att4 = attemptEventResolution(kEv, inst4, 'politics');
att4.outcome = 'success';
att4.overridden = true;
applyEventResolution(kEv, inst4, att4);
expect('beneficial success → resolved', inst4.status, 'resolved');

console.log('\n--- tickContinuousEvents ---');
const kTick = makeEmptyKingdom('Tick Realm');
kTick.level = 5;
kTick.stockpiles.rp = 10;
const banditInst = triggerEventInstance(kTick, 'bandit-activity');
const tickRpBefore = kTick.stockpiles.rp;
const tickCrimeBefore = kTick.ruin.crime.value;
const tickResults = tickContinuousEvents(kTick);
expect('tick: 1 continuous event ticked', tickResults.length, 1);
expect('tick: bandit upkeep effect applied (rp -1)', tickRpBefore - kTick.stockpiles.rp, 1);
expect('tick: crime +1', kTick.ruin.crime.value - tickCrimeBefore, 1);

// Resolved continuous events shouldn't tick
banditInst.status = 'resolved';
const tickResults2 = tickContinuousEvents(kTick);
expect('tick: resolved events skipped', tickResults2.length, 0);

console.log('\n--- dismiss / delete ---');
const kCleanup = makeEmptyKingdom('Cleanup Realm');
const inst5 = triggerEventInstance(kCleanup, 'cult-activity');
dismissEventInstance(kCleanup, inst5.id);
expect('dismiss: status = dismissed', kCleanup.eventInstances[inst5.id].status, 'dismissed');
deleteEventInstance(kCleanup, inst5.id);
expect('delete: removed from roster', !!kCleanup.eventInstances[inst5.id], false);

console.log('\n--- computeEventSummary ---');
const kSum = makeEmptyKingdom('Summary Realm');
const i1 = triggerEventInstance(kSum, 'bandit-activity');
const i2 = triggerEventInstance(kSum, 'cult-activity');
const i3 = triggerEventInstance(kSum, 'visiting-celebrity');
i3.status = 'resolved';
i2.status = 'worsened';
i2.dcModifier = 2;
const evSum = computeEventSummary(kSum);
expect('summary: total = 3', evSum.total, 3);
expect('summary: active includes 2 (active+worsened)', evSum.active.length, 2);
expect('summary: resolved = 1', evSum.resolved.length, 1);
expect('summary: continuous ticking = 2', evSum.continuousTicking, 2);
expect('summary: warning for worsened cult', evSum.warnings.some(w => w.includes('Cult')), true);

// =============================================================
// Advancement / Level-up engine
// =============================================================
import {
  abilityCapForLevel,
  canLevelUp,
  validateBoostsAgainstCap,
  applyLevelUp,
  XP_PER_LEVEL,
} from '../src/kingdom';
import {
  ALL_FEATS,
  FEAT_BY_ID,
  HEARTLAND_FEATS,
  GOVERNMENT_FEATS,
  GENERAL_FEATS,
  featsAvailableFor,
  levelGrantsGeneralFeat,
  levelGrantsSkillIncrease,
} from '../src/feats';

console.log('\n--- Level-up: catalogue ---');
expect('catalogue has heartland feats', HEARTLAND_FEATS.length >= 6, true);
expect('catalogue has government feats', GOVERNMENT_FEATS.length >= 6, true);
expect('catalogue has 25+ general feats', GENERAL_FEATS.length >= 25, true);

console.log('\n--- abilityCapForLevel ---');
expect('lvl 1 cap = 18', abilityCapForLevel(1), 18);
expect('lvl 4 cap = 18', abilityCapForLevel(4), 18);
expect('lvl 5 cap = 22', abilityCapForLevel(5), 22);
expect('lvl 14 cap = 22', abilityCapForLevel(14), 22);
expect('lvl 15 cap = 25', abilityCapForLevel(15), 25);
expect('lvl 20 cap = 25', abilityCapForLevel(20), 25);

console.log('\n--- canLevelUp ---');
const kLvl = makeEmptyKingdom('LevelTest');
kLvl.xp = 500;
expect('500 XP cannot level up', canLevelUp(kLvl), false);
kLvl.xp = 1000;
expect('1000 XP can level up', canLevelUp(kLvl), true);
kLvl.xp = 1500;
expect('1500 XP can level up', canLevelUp(kLvl), true);
kLvl.xp = 1000;
kLvl.level = 20;
expect('lvl 20 cannot advance', canLevelUp(kLvl), false);

console.log('\n--- validateBoostsAgainstCap ---');
const kV = makeEmptyKingdom('CapTest');
kV.level = 4;
kV.abilities.agriculture = 16;
// At lvl 5 (advancing TO 5), cap rises to 22; agriculture 16 + 2 = 18, fine
expect('boost 16 → 18 at lvl 5 cap 22 = OK', validateBoostsAgainstCap(kV, ['agriculture'], 5), null);
// But if we boost agriculture twice (16 → 20), it's fine
expect('boost agriculture twice 16 → 20 at lvl 5 cap 22 = OK', validateBoostsAgainstCap(kV, ['agriculture', 'agriculture'], 5), null);
// 4 boosts on agriculture pushes 16 + 8 = 24, over cap 22
const violation = validateBoostsAgainstCap(kV, ['agriculture', 'agriculture', 'agriculture', 'agriculture'], 5);
expect('4 boosts agriculture 16 → 24 at lvl 5 cap 22 = violation', !!violation, true);
expect('violation flags agriculture', violation?.ability, 'agriculture');

console.log('\n--- applyLevelUp ---');
const kApp = makeEmptyKingdom('Applied');
kApp.level = 4;
kApp.xp = 1200;
kApp.abilities.agriculture = 14;
kApp.abilities.warfare = 12;
applyLevelUp(kApp, {
  boosts: ['agriculture', 'warfare', 'arts', 'industry'],
});
expect('level advanced 4 → 5', kApp.level, 5);
expect('XP carried over (1200 - 1000 = 200)', kApp.xp, 200);
expect('agriculture +2', kApp.abilities.agriculture, 16);
expect('warfare +2', kApp.abilities.warfare, 14);
expect('event log contains level-up entry', kApp.events.some(e => e.title?.includes('Level up')), true);

console.log('\n--- applyLevelUp with skill increase + feat ---');
const kFull = makeEmptyKingdom('FullLvlUp');
kFull.level = 4;
kFull.xp = 1000;
kFull.proficiencies.trade = 'trained';
applyLevelUp(kFull, {
  boosts: ['trade', 'arts', 'industry', 'politics'],
  skillIncrease: 'trade',
  generalFeatId: 'civil-service',
});
expect('skill increase applied: trained → expert', kFull.proficiencies.trade, 'expert');
expect('feat added to roster', kFull.feats.includes('civil-service'), true);

console.log('\n--- applyLevelUp throws on cap violation ---');
const kBad = makeEmptyKingdom('BadLvlUp');
kBad.level = 4;
kBad.xp = 1000;
kBad.abilities.agriculture = 18; // already at level-4 cap
// Boost agriculture would push to 20, but lvl 5 cap is 22, so it's OK actually
// Need to be over the cap - try lvl 4 -> 5, boost 4 agricultures = 18 → 26, lvl 5 cap 22
let threw = false;
try {
  applyLevelUp(kBad, {
    boosts: ['agriculture', 'agriculture', 'agriculture', 'agriculture'],
  });
} catch {
  threw = true;
}
expect('applyLevelUp throws on cap violation', threw, true);
// Confirm no partial mutation occurred
expect('cap-violation: level unchanged', kBad.level, 4);
expect('cap-violation: xp unchanged', kBad.xp, 1000);

console.log('\n--- Feat filtering ---');
expect('lvl 2 grants general feat', levelGrantsGeneralFeat(2), true);
expect('lvl 3 does NOT grant general feat', levelGrantsGeneralFeat(3), false);
expect('lvl 4 grants general feat', levelGrantsGeneralFeat(4), true);
expect('lvl 3 grants skill increase', levelGrantsSkillIncrease(3), true);
expect('lvl 2 does NOT grant skill increase', levelGrantsSkillIncrease(2), false);

const eligibleAtLvl4 = featsAvailableFor([], 4, 'forest', 'feudalism', 'general');
expect('lvl 4 eligible includes lvl 2 + lvl 4 general feats', eligibleAtLvl4.length >= 8, true);
const heartlandForestLvl1 = featsAvailableFor([], 1, 'forest', 'feudalism', 'heartland');
expect('forest heartland lvl 1: only forest matches', heartlandForestLvl1.every(f => f.requires === 'forest'), true);
expect('forest heartland lvl 1: at least one option', heartlandForestLvl1.length >= 1, true);
const takenSomething = featsAvailableFor(['civil-service'], 4, 'forest', 'feudalism', 'general');
expect('already-taken feat is filtered out', takenSomething.some(f => f.id === 'civil-service'), false);

console.log(`\n========\nResults: ${pass} passed, ${fail} failed\n========`);
if (fail > 0) process.exit(1);
