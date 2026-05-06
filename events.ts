// =============================================================
// Hex map geometry + derived data
// =============================================================
// Pointy-top axial coordinate system. Pure functions; no DOM.
//
// Conventions:
//   - Pointy-top hexes (vertex up)
//   - Axial coords (q, r):
//       q increases east-ish (rightward)
//       r increases south-east-ish (down-right)
//   - Edge numbering, clockwise from NE:
//       0 = NE  1 = E   2 = SE
//       3 = SW  4 = W   5 = NW
//   - Cube coords for distance: x=q, z=r, y=-x-z
//
// References:
//   https://www.redblobgames.com/grids/hexagons/

import {
  TERRAIN_LABELS,
  WORKSITE_ALLOWED_TERRAINS,
  WORKSITE_LABELS,
  hexKey,
  type HexData,
  type HexEdge,
  type KingdomState,
  type SettlementState,
  type Terrain,
  type Worksite,
} from './types';

// =============================================================
// Geometry constants
// =============================================================

/** Hex size in pixels (radius from centre to vertex). */
export const HEX_SIZE = 36;

/** Width of a pointy-top hex (flat-to-flat). */
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;

/** Height of a pointy-top hex (vertex-to-vertex). */
export const HEX_HEIGHT = 2 * HEX_SIZE;

/**
 * Convert axial (q, r) → pixel (x, y) for pointy-top layout.
 * Centre of the (0,0) hex sits at pixel (0, 0).
 */
export function axialToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
  const y = HEX_SIZE * (3 / 2 * r);
  return { x, y };
}

/**
 * Convert pixel (x, y) → fractional axial (q, r), then round to nearest hex.
 * Used for click-to-hex picking.
 */
export function pixelToAxial(x: number, y: number): { q: number; r: number } {
  const fq = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE;
  const fr = (2 / 3 * y) / HEX_SIZE;
  return axialRound(fq, fr);
}

/** Round a fractional axial coord to the nearest hex (cube-rounding). */
export function axialRound(fq: number, fr: number): { q: number; r: number } {
  // Convert to cube
  let x = fq;
  let z = fr;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  return { q: rx, r: rz };
}

/** Six unit-vector neighbours in axial space, indexed by edge 0..5. */
const AXIAL_DIRS: Array<{ q: number; r: number }> = [
  { q: +1, r: -1 }, // 0 NE
  { q: +1, r: 0 },  // 1 E
  { q: 0, r: +1 },  // 2 SE
  { q: -1, r: +1 }, // 3 SW
  { q: -1, r: 0 },  // 4 W
  { q: 0, r: -1 },  // 5 NW
];

/** Get the neighbour of (q,r) across the given edge. */
export function neighbor(q: number, r: number, edge: HexEdge): { q: number; r: number } {
  const d = AXIAL_DIRS[edge];
  return { q: q + d.q, r: r + d.r };
}

/** All six neighbours of a hex. */
export function allNeighbors(q: number, r: number): { q: number; r: number; edge: HexEdge }[] {
  return AXIAL_DIRS.map((d, i) => ({ q: q + d.q, r: r + d.r, edge: i as HexEdge }));
}

/** Distance between two hexes in axial coords (cube distance). */
export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * For pointy-top hexes, generate the 6 vertex offsets (in pixels) relative
 * to a hex centre. Index 0 starts at the top vertex and goes clockwise.
 */
export function hexVertices(): Array<{ x: number; y: number }> {
  const verts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    // Pointy-top: vertex 0 at the top, then clockwise. Angles in degrees: 90, 30, -30, -90, -150, 150.
    // In SVG y is inverted; we use sin/cos starting from the top.
    const angleDeg = 60 * i - 90; // -90 = top, 0=right? actually pointy-top uses -90 (top) start
    const angleRad = (Math.PI / 180) * angleDeg;
    verts.push({
      x: HEX_SIZE * Math.cos(angleRad),
      y: HEX_SIZE * Math.sin(angleRad),
    });
  }
  return verts;
}

/**
 * Get the SVG `points=""` polygon string for a hex centred at (cx, cy).
 * Pointy-top: the resulting polygon has a vertex at the top.
 */
export function hexPolygonPoints(cx: number, cy: number): string {
  const verts = hexVertices();
  return verts.map(v => `${(cx + v.x).toFixed(2)},${(cy + v.y).toFixed(2)}`).join(' ');
}

/**
 * Get the two endpoint vertices for a given edge of a hex centred at (cx, cy).
 * Edge numbering starts at NE (0) and goes clockwise. For pointy-top hexes:
 *   edge 0 (NE)  = between vertex 0 (top) and vertex 1 (upper-right)
 *   edge 1 (E)   = between vertex 1 (upper-right) and vertex 2 (lower-right)
 *   edge 2 (SE)  = between vertex 2 and vertex 3 (bottom)
 *   edge 3 (SW)  = between vertex 3 (bottom) and vertex 4 (lower-left)
 *   edge 4 (W)   = between vertex 4 and vertex 5 (upper-left)
 *   edge 5 (NW)  = between vertex 5 (upper-left) and vertex 0 (top)
 */
export function edgeEndpoints(cx: number, cy: number, edge: HexEdge): { x1: number; y1: number; x2: number; y2: number } {
  const verts = hexVertices();
  const v1 = verts[edge];
  const v2 = verts[(edge + 1) % 6];
  return { x1: cx + v1.x, y1: cy + v1.y, x2: cx + v2.x, y2: cy + v2.y };
}

// =============================================================
// Map bounds & viewport
// =============================================================

/**
 * Compute the pixel-space bounding box of all hexes in the kingdom (claimed
 * or otherwise visible). Returns sensible defaults when no hexes exist yet.
 */
export function computeMapBounds(state: KingdomState): { minX: number; minY: number; maxX: number; maxY: number } {
  const keys = Object.keys(state.hexes);
  if (keys.length === 0) {
    return { minX: -HEX_WIDTH * 3, minY: -HEX_HEIGHT * 3, maxX: HEX_WIDTH * 3, maxY: HEX_HEIGHT * 3 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const key of keys) {
    const hex = state.hexes[key];
    const { x, y } = axialToPixel(hex.q, hex.r);
    if (x - HEX_WIDTH / 2 < minX) minX = x - HEX_WIDTH / 2;
    if (x + HEX_WIDTH / 2 > maxX) maxX = x + HEX_WIDTH / 2;
    if (y - HEX_HEIGHT / 2 < minY) minY = y - HEX_HEIGHT / 2;
    if (y + HEX_HEIGHT / 2 > maxY) maxY = y + HEX_HEIGHT / 2;
  }
  // Pad by one hex width so edge content has breathing room
  return {
    minX: minX - HEX_WIDTH,
    minY: minY - HEX_HEIGHT,
    maxX: maxX + HEX_WIDTH,
    maxY: maxY + HEX_HEIGHT,
  };
}

// =============================================================
// Derived hex-map summary (used by the kingdom sheet)
// =============================================================

export interface HexMapSummary {
  /** Total claimed hex count. */
  claimed: number;
  /** Counts by terrain type (claimed only). */
  terrainCounts: Record<Terrain, number>;
  /** Counts by worksite type (claimed only). */
  worksiteCounts: Record<Worksite, number>;
  /** Total length of road network in hex-edges (claimed hexes only). */
  roadEdges: number;
  /**
   * Misplaced worksites (worksite incompatible with the hex's terrain).
   * Each entry has the offending hex + reason.
   */
  invalidWorksites: { q: number; r: number; reason: string }[];
  /**
   * Settlements that are sited on a hex but the linked settlement record
   * doesn't exist. Indicates dangling references.
   */
  danglingSettlements: { q: number; r: number; settlementId: string }[];
  /** Hexes that contain a settlement, with both hex coords and settlement name. */
  settlementHexes: { q: number; r: number; settlementId: string; name: string | null }[];
}

export function computeHexMapSummary(
  state: KingdomState,
  allSettlements: Record<string, SettlementState>,
): HexMapSummary {
  const terrainCounts: Record<Terrain, number> = {
    plains: 0, forest: 0, hills: 0, mountains: 0,
    swamp: 0, desert: 0, wetland: 0, lake: 0,
  };
  const worksiteCounts: Record<Worksite, number> = {
    'lumber-camp': 0, mine: 0, quarry: 0, farmland: 0,
  };
  const invalidWorksites: { q: number; r: number; reason: string }[] = [];
  const danglingSettlements: { q: number; r: number; settlementId: string }[] = [];
  const settlementHexes: { q: number; r: number; settlementId: string; name: string | null }[] = [];

  let claimed = 0;
  let roadEdges = 0;

  for (const key of Object.keys(state.hexes)) {
    const hex = state.hexes[key];
    if (!hex.claimed) continue;
    claimed++;
    terrainCounts[hex.terrain]++;
    if (hex.worksite) {
      worksiteCounts[hex.worksite]++;
      const allowed = WORKSITE_ALLOWED_TERRAINS[hex.worksite];
      if (!allowed.includes(hex.terrain)) {
        invalidWorksites.push({
          q: hex.q,
          r: hex.r,
          reason: `${WORKSITE_LABELS[hex.worksite]} requires ${allowed.map(t => TERRAIN_LABELS[t]).join(' or ')} terrain (this hex is ${TERRAIN_LABELS[hex.terrain]}).`,
        });
      }
    }
    if (hex.settlementId) {
      const linked = allSettlements[hex.settlementId];
      if (!linked) {
        danglingSettlements.push({ q: hex.q, r: hex.r, settlementId: hex.settlementId });
        settlementHexes.push({ q: hex.q, r: hex.r, settlementId: hex.settlementId, name: null });
      } else {
        settlementHexes.push({ q: hex.q, r: hex.r, settlementId: hex.settlementId, name: linked.name });
      }
    }
    // Road edges (avoid double-counting by only counting edges 0,1,2 — the other side will count theirs but they're shared)
    // Actually for a road on edge 1, the neighbour records its own road on edge 4. Both are claimed. Naive sum / 2.
    for (const e of [0, 1, 2, 3, 4, 5] as HexEdge[]) {
      if (hex.roads[e]) roadEdges++;
    }
  }
  // Each road edge is double-counted (once from each side). But only if the neighbour is also claimed.
  // For a simple "road network length" stat, divide by 2; this slightly under-counts roads that lead to unclaimed hexes.
  roadEdges = Math.round(roadEdges / 2);

  return {
    claimed,
    terrainCounts,
    worksiteCounts,
    roadEdges,
    invalidWorksites,
    danglingSettlements,
    settlementHexes,
  };
}

// =============================================================
// Helpers used by the view
// =============================================================

/** Get a hex by axial coords, creating it on demand if absent. */
export function ensureHex(state: KingdomState, q: number, r: number): HexData {
  const key = hexKey(q, r);
  if (!state.hexes[key]) {
    state.hexes[key] = {
      q, r,
      claimed: false,
      terrain: 'plains',
      roads: { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false },
    };
  }
  return state.hexes[key];
}

/**
 * Get a hex if it exists (without creating). Returns undefined for blank
 * positions — useful when rendering, where we don't want to mutate state.
 */
export function getHex(state: KingdomState, q: number, r: number): HexData | undefined {
  return state.hexes[hexKey(q, r)];
}

/**
 * Return a list of hexes to render. Includes:
 *   - all stored hexes (claimed or otherwise touched)
 *   - blank "ghost" hexes immediately adjacent to claimed hexes
 *     so the user can click to expand the territory
 */
export function visibleHexes(state: KingdomState): HexData[] {
  const out = new Map<string, HexData>();
  for (const key of Object.keys(state.hexes)) {
    out.set(key, state.hexes[key]);
  }
  // Add neighbours of claimed hexes as ghost hexes
  for (const key of Object.keys(state.hexes)) {
    const hex = state.hexes[key];
    if (!hex.claimed) continue;
    for (const n of allNeighbors(hex.q, hex.r)) {
      const nkey = hexKey(n.q, n.r);
      if (!out.has(nkey)) {
        out.set(nkey, {
          q: n.q,
          r: n.r,
          claimed: false,
          terrain: 'plains',
          roads: { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false },
        });
      }
    }
  }
  // If still no hexes (totally fresh kingdom), seed a 3-radius hex of ghost hexes around (0,0)
  if (out.size === 0) {
    for (let q = -2; q <= 2; q++) {
      for (let r = Math.max(-2, -q - 2); r <= Math.min(2, -q + 2); r++) {
        out.set(hexKey(q, r), {
          q, r,
          claimed: false,
          terrain: 'plains',
          roads: { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false },
        });
      }
    }
  }
  return Array.from(out.values());
}

/**
 * Whether the road on the given edge of (q,r) is present, accounting for
 * the symmetric storage on the neighbour. (We let both sides store roads
 * independently, so this just checks our own.)
 */
export function hasRoad(state: KingdomState, q: number, r: number, edge: HexEdge): boolean {
  const hex = getHex(state, q, r);
  if (!hex) return false;
  return hex.roads[edge];
}

/**
 * Toggle the road on a given edge, AND mirror the change on the neighbour
 * across that edge so the two hexes agree.
 */
export function toggleRoad(state: KingdomState, q: number, r: number, edge: HexEdge): void {
  const hex = ensureHex(state, q, r);
  hex.roads[edge] = !hex.roads[edge];
  const n = neighbor(q, r, edge);
  const oppositeEdge = ((edge + 3) % 6) as HexEdge;
  const neighborHex = ensureHex(state, n.q, n.r);
  neighborHex.roads[oppositeEdge] = hex.roads[edge];
}
