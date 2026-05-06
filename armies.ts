// =============================================================
// HexMapView — SVG-based pointy-top hex grid editor
// =============================================================
// Rendering pipeline:
//   1. Compute viewport (bounds + pan + zoom).
//   2. For each visible hex (claimed + neighbours-of-claimed + minimum
//      seed grid), render a polygon with terrain fill.
//   3. Overlay worksite icon, settlement marker, road segments along
//      shared edges.
//   4. Click-to-edit opens an inline popover.
//
// State changes go through `onKingdomChange` and trigger a full re-render
// (cheap; SVG strings are tiny).

import { App, Notice } from 'obsidian';
import {
  axialToPixel,
  computeMapBounds,
  ensureHex,
  hexPolygonPoints,
  edgeEndpoints,
  toggleRoad,
  visibleHexes,
  HEX_SIZE,
} from './hex';
import {
  TERRAIN_LABELS,
  WORKSITE_ALLOWED_TERRAINS,
  WORKSITE_LABELS,
  hexKey,
  type HexData,
  type KingdomState,
  type SettlementState,
  type Terrain,
  type Worksite,
  type HexEdge,
} from './types';

export interface HexMapOptions {
  kingdom: KingdomState;
  /** All settlements in the vault (filtered internally by kingdomName). */
  allSettlements: Record<string, SettlementState>;
  onKingdomChange: (next: KingdomState) => Promise<void>;
}

const TERRAINS: Terrain[] = ['plains', 'forest', 'hills', 'mountains', 'swamp', 'desert', 'wetland', 'lake'];
const WORKSITES: Worksite[] = ['lumber-camp', 'mine', 'quarry', 'farmland'];

/**
 * Terrain → fill colour. Uses CSS variables so themes work, but with
 * sensible defaults that lean into Kingmaker AP map conventions:
 *   - greens for vegetated terrain
 *   - browns for dry/elevated
 *   - blues for water
 */
const TERRAIN_FILL: Record<Terrain, string> = {
  plains: '#cdd9a8',
  forest: '#4d7c45',
  hills: '#a4895a',
  mountains: '#7a7062',
  swamp: '#5d6f50',
  desert: '#dec693',
  wetland: '#8aa676',
  lake: '#6792b3',
};

const TERRAIN_STROKE: Record<Terrain, string> = {
  plains: '#9da870',
  forest: '#2c5824',
  hills: '#7a623a',
  mountains: '#4d4538',
  swamp: '#3a4632',
  desert: '#b59e6a',
  wetland: '#5d7a4a',
  lake: '#3a6488',
};

export class HexMapView {
  private app: App;
  private rootEl: HTMLElement;
  private opts: HexMapOptions;

  // Viewport state (kept on the view, not persisted — pan resets on reload)
  private panX = 0;
  private panY = 0;
  private zoom = 1;

  // Selection / edit state
  private selectedKey: string | null = null;
  private isDraggingPan = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPanX = 0;
  private dragStartPanY = 0;

  constructor(app: App, rootEl: HTMLElement, opts: HexMapOptions) {
    this.app = app;
    this.rootEl = rootEl;
    this.opts = opts;
  }

  render() {
    this.rootEl.empty();
    this.rootEl.addClass('km-hex-root');

    const header = this.rootEl.createDiv({ cls: 'km-hex-header' });
    header.createEl('h3', { text: `${this.opts.kingdom.name} — Territory` });
    const stats = header.createDiv({ cls: 'km-hex-headerstats' });
    const claimed = Object.values(this.opts.kingdom.hexes).filter(h => h.claimed).length;
    stats.createSpan({ text: `${claimed} hex${claimed === 1 ? '' : 'es'} claimed` });

    // Toolbar with zoom + reset-view + recenter buttons
    const toolbar = this.rootEl.createDiv({ cls: 'km-hex-toolbar' });
    const zoomOut = toolbar.createEl('button', { text: '−' });
    zoomOut.setAttr('title', 'Zoom out');
    zoomOut.addEventListener('click', () => {
      this.zoom = Math.max(0.4, this.zoom - 0.15);
      this.render();
    });
    const zoomLabel = toolbar.createSpan({ cls: 'km-hex-zoomlabel', text: `${Math.round(this.zoom * 100)}%` });
    const zoomIn = toolbar.createEl('button', { text: '+' });
    zoomIn.setAttr('title', 'Zoom in');
    zoomIn.addEventListener('click', () => {
      this.zoom = Math.min(2.5, this.zoom + 0.15);
      this.render();
    });
    const resetBtn = toolbar.createEl('button', { text: 'Centre' });
    resetBtn.setAttr('title', 'Reset pan & zoom');
    resetBtn.addEventListener('click', () => {
      this.panX = 0;
      this.panY = 0;
      this.zoom = 1;
      this.render();
    });
    const helpBtn = toolbar.createEl('button', { text: '?' });
    helpBtn.setAttr('title', 'How to use');
    helpBtn.addEventListener('click', () => {
      new Notice(
        'Click an empty hex to claim it. Click a claimed hex to edit terrain, worksite, settlement, and roads. Drag the background to pan; use the zoom buttons or scroll wheel to zoom.',
        9000,
      );
    });

    // SVG canvas
    this.renderSvg();

    // Map summary footer (terrain breakdown, worksite breakdown, warnings)
    this.renderFooter();
  }

  // =============================================================
  // SVG rendering
  // =============================================================
  private renderSvg() {
    const wrap = this.rootEl.createDiv({ cls: 'km-hex-svgwrap' });
    const bounds = computeMapBounds(this.opts.kingdom);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    // We map to a fixed-aspect SVG; pan/zoom achieved by transforming the
    // inner <g>.
    const VIEW_W = 720;
    const VIEW_H = 480;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute('class', 'km-hex-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    wrap.appendChild(svg);

    // Pan/zoom group: centre the bounds initially, apply user pan and zoom.
    const cx = bounds.minX + w / 2;
    const cy = bounds.minY + h / 2;
    const baseScale = Math.min(VIEW_W / w, VIEW_H / h, 1);
    const scale = baseScale * this.zoom;
    const translateX = VIEW_W / 2 - cx * scale + this.panX;
    const translateY = VIEW_H / 2 - cy * scale + this.panY;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${translateX} ${translateY}) scale(${scale})`);
    svg.appendChild(g);

    // Mouse pan handlers on the SVG itself
    svg.addEventListener('mousedown', e => {
      // Don't start pan if the click landed on a hex polygon (it'll handle).
      // We start a pan and let the click handler decide whether to treat it
      // as a click vs a drag based on movement distance.
      this.isDraggingPan = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartPanX = this.panX;
      this.dragStartPanY = this.panY;
    });
    svg.addEventListener('mousemove', e => {
      if (!this.isDraggingPan) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.abs(dx) + Math.abs(dy) < 4) return; // small movements: treat as click
      this.panX = this.dragStartPanX + dx;
      this.panY = this.dragStartPanY + dy;
      g.setAttribute('transform', `translate(${VIEW_W / 2 - cx * scale + this.panX} ${VIEW_H / 2 - cy * scale + this.panY}) scale(${scale})`);
    });
    svg.addEventListener('mouseup', () => { this.isDraggingPan = false; });
    svg.addEventListener('mouseleave', () => { this.isDraggingPan = false; });

    // Wheel zoom
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      this.zoom = Math.max(0.4, Math.min(2.5, this.zoom + delta));
      this.render();
    }, { passive: false });

    // Render hexes — three passes:
    //   1. Polygons (terrain fill)
    //   2. Roads (drawn over the boundary lines)
    //   3. Worksite icons + settlement markers + selection ring
    const hexes = visibleHexes(this.opts.kingdom);

    // Pass 1: polygons
    for (const hex of hexes) {
      const { x, y } = axialToPixel(hex.q, hex.r);
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', hexPolygonPoints(x, y));
      poly.setAttribute('class', `km-hex km-hex-${hex.terrain}${hex.claimed ? ' is-claimed' : ' is-ghost'}`);
      poly.setAttribute('fill', TERRAIN_FILL[hex.terrain]);
      poly.setAttribute('stroke', TERRAIN_STROKE[hex.terrain]);
      poly.setAttribute('stroke-width', '1.5');
      if (!hex.claimed) {
        poly.setAttribute('opacity', '0.35');
        poly.setAttribute('stroke-dasharray', '3,3');
      }
      poly.setAttribute('data-key', hexKey(hex.q, hex.r));
      poly.setAttribute('cursor', 'pointer');
      poly.addEventListener('click', e => {
        e.stopPropagation();
        // Suppress click if it was actually the end of a drag
        if (this.isDraggingPan) {
          const dx = e.clientX - this.dragStartX;
          const dy = e.clientY - this.dragStartY;
          if (Math.abs(dx) + Math.abs(dy) >= 4) return;
        }
        this.onHexClick(hex);
      });
      g.appendChild(poly);
    }

    // Pass 2: roads (only between claimed hexes, drawn once per edge)
    const drawnRoads = new Set<string>();
    for (const hex of hexes) {
      if (!hex.claimed) continue;
      const { x, y } = axialToPixel(hex.q, hex.r);
      for (const e of [0, 1, 2, 3, 4, 5] as HexEdge[]) {
        if (!hex.roads[e]) continue;
        // De-dupe: build a canonical key from the two hex coords + edge
        const dirs: { q: number; r: number }[] = [
          { q: +1, r: -1 }, { q: +1, r: 0 }, { q: 0, r: +1 },
          { q: -1, r: +1 }, { q: -1, r: 0 }, { q: 0, r: -1 },
        ];
        const n = { q: hex.q + dirs[e].q, r: hex.r + dirs[e].r };
        const ckey = [hexKey(hex.q, hex.r), hexKey(n.q, n.r)].sort().join('|');
        if (drawnRoads.has(ckey)) continue;
        drawnRoads.add(ckey);

        const ep = edgeEndpoints(x, y, e);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${ep.x1}`);
        line.setAttribute('y1', `${ep.y1}`);
        line.setAttribute('x2', `${ep.x2}`);
        line.setAttribute('y2', `${ep.y2}`);
        line.setAttribute('stroke', '#5a3d20');
        line.setAttribute('stroke-width', '4');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('class', 'km-hex-road');
        g.appendChild(line);
      }
    }

    // Pass 3: overlays (worksite icons, settlement markers, selection)
    for (const hex of hexes) {
      if (!hex.claimed) continue;
      const { x, y } = axialToPixel(hex.q, hex.r);

      // Worksite icon: a small rect with letter
      if (hex.worksite) {
        const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('x', `${x - 11}`);
        r.setAttribute('y', `${y - 11}`);
        r.setAttribute('width', '22');
        r.setAttribute('height', '22');
        r.setAttribute('rx', '3');
        r.setAttribute('fill', '#3a2916');
        r.setAttribute('stroke', '#d6a854');
        r.setAttribute('stroke-width', '1.5');
        r.setAttribute('opacity', '0.92');
        grp.appendChild(r);
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', `${x}`);
        t.setAttribute('y', `${y + 4}`);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', '#f0d28a');
        t.setAttribute('font-size', '14');
        t.setAttribute('font-weight', '700');
        t.setAttribute('font-family', 'serif');
        t.setAttribute('pointer-events', 'none');
        const letter = hex.worksite === 'lumber-camp' ? 'L'
          : hex.worksite === 'mine' ? 'M'
          : hex.worksite === 'quarry' ? 'Q'
          : 'F';
        t.textContent = letter;
        grp.appendChild(t);
        grp.setAttribute('pointer-events', 'none');
        g.appendChild(grp);
      }

      // Settlement marker: a small castle-tower pictogram with the name
      if (hex.settlementId) {
        const settlement = this.opts.allSettlements[hex.settlementId];
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        marker.setAttribute('pointer-events', 'none');

        // Draw a small "castle" shape: a 3-tooth crenellated rectangle
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cx = x;
        const cy = y - 4;
        path.setAttribute('d', [
          `M ${cx - 10} ${cy + 8}`,
          `L ${cx - 10} ${cy - 4}`,
          `L ${cx - 7} ${cy - 4}`,
          `L ${cx - 7} ${cy - 7}`,
          `L ${cx - 4} ${cy - 7}`,
          `L ${cx - 4} ${cy - 4}`,
          `L ${cx - 1.5} ${cy - 4}`,
          `L ${cx - 1.5} ${cy - 7}`,
          `L ${cx + 1.5} ${cy - 7}`,
          `L ${cx + 1.5} ${cy - 4}`,
          `L ${cx + 4} ${cy - 4}`,
          `L ${cx + 4} ${cy - 7}`,
          `L ${cx + 7} ${cy - 7}`,
          `L ${cx + 7} ${cy - 4}`,
          `L ${cx + 10} ${cy - 4}`,
          `L ${cx + 10} ${cy + 8}`,
          'Z',
        ].join(' '));
        path.setAttribute('fill', '#ffffff');
        path.setAttribute('stroke', '#2a2519');
        path.setAttribute('stroke-width', '1.5');
        marker.appendChild(path);

        // Label below
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', `${x}`);
        label.setAttribute('y', `${y + HEX_SIZE - 4}`);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '600');
        label.setAttribute('font-family', 'serif');
        label.setAttribute('fill', '#2a2519');
        label.setAttribute('paint-order', 'stroke');
        label.setAttribute('stroke', '#f5edd6');
        label.setAttribute('stroke-width', '3');
        label.textContent = settlement?.name ?? '?';
        marker.appendChild(label);

        g.appendChild(marker);
      }

      // Selection ring
      if (this.selectedKey === hexKey(hex.q, hex.r)) {
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        ring.setAttribute('points', hexPolygonPoints(x, y));
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', '#d6a854');
        ring.setAttribute('stroke-width', '3');
        ring.setAttribute('pointer-events', 'none');
        g.appendChild(ring);
      }
    }
  }

  // =============================================================
  // Click handling
  // =============================================================
  private onHexClick(hex: HexData) {
    const key = hexKey(hex.q, hex.r);
    this.selectedKey = key;

    // If the hex isn't yet claimed, just mark it claimed (one click → claim).
    if (!this.opts.kingdom.hexes[key]) {
      const created = ensureHex(this.opts.kingdom, hex.q, hex.r);
      created.claimed = true;
      this.commit().then(() => this.render());
      return;
    }
    const stored = this.opts.kingdom.hexes[key];
    if (!stored.claimed) {
      stored.claimed = true;
      this.commit().then(() => this.render());
      return;
    }

    // Already-claimed: render and open the editor popover.
    this.render();
    this.openEditor(stored);
  }

  // =============================================================
  // Inline editor popover
  // =============================================================
  private openEditor(hex: HexData) {
    // Remove any existing popover
    this.rootEl.querySelectorAll('.km-hex-editor').forEach(el => el.remove());

    const editor = this.rootEl.createDiv({ cls: 'km-hex-editor' });

    const head = editor.createDiv({ cls: 'km-hex-editor-head' });
    head.createEl('h4', { text: `Hex (${hex.q}, ${hex.r})` });
    const closeBtn = head.createEl('button', { text: '×', cls: 'km-hex-editor-close' });
    closeBtn.addEventListener('click', () => {
      this.selectedKey = null;
      editor.remove();
      this.render();
    });

    // ---- Claim toggle ----
    const claimRow = editor.createDiv({ cls: 'km-hex-editor-row' });
    const claimLabel = claimRow.createEl('label');
    const claimCb = claimLabel.createEl('input', { type: 'checkbox' });
    claimCb.checked = hex.claimed;
    claimLabel.appendText(' Claimed');
    claimCb.addEventListener('change', async () => {
      hex.claimed = claimCb.checked;
      await this.commit();
      this.render();
    });

    // ---- Terrain ----
    const terrRow = editor.createDiv({ cls: 'km-hex-editor-row' });
    terrRow.createEl('label', { text: 'Terrain' });
    const terrSel = terrRow.createEl('select');
    for (const t of TERRAINS) {
      const opt = terrSel.createEl('option', { value: t, text: TERRAIN_LABELS[t] });
      if (hex.terrain === t) opt.selected = true;
    }
    terrSel.addEventListener('change', async () => {
      hex.terrain = terrSel.value as Terrain;
      // If the new terrain doesn't allow the existing worksite, drop it.
      if (hex.worksite) {
        const allowed = WORKSITE_ALLOWED_TERRAINS[hex.worksite];
        if (!allowed.includes(hex.terrain)) {
          new Notice(`${WORKSITE_LABELS[hex.worksite]} doesn't fit ${TERRAIN_LABELS[hex.terrain]}; removed worksite.`);
          hex.worksite = undefined;
        }
      }
      await this.commit();
      this.render();
      this.openEditor(hex); // reopen to refresh worksite dropdown availability
    });

    // ---- Worksite ----
    const wsRow = editor.createDiv({ cls: 'km-hex-editor-row' });
    wsRow.createEl('label', { text: 'Worksite' });
    const wsSel = wsRow.createEl('select');
    wsSel.createEl('option', { value: '', text: '— None —' });
    for (const w of WORKSITES) {
      const allowed = WORKSITE_ALLOWED_TERRAINS[w].includes(hex.terrain);
      const opt = wsSel.createEl('option', {
        value: w,
        text: `${WORKSITE_LABELS[w]}${allowed ? '' : ' (not on ' + TERRAIN_LABELS[hex.terrain] + ')'}`,
      });
      if (!allowed) opt.disabled = true;
      if (hex.worksite === w) opt.selected = true;
    }
    wsSel.addEventListener('change', async () => {
      hex.worksite = wsSel.value === '' ? undefined : (wsSel.value as Worksite);
      await this.commit();
      this.render();
    });

    // ---- Settlement ----
    const setRow = editor.createDiv({ cls: 'km-hex-editor-row' });
    setRow.createEl('label', { text: 'Settlement' });
    const setSel = setRow.createEl('select');
    setSel.createEl('option', { value: '', text: '— None —' });
    const myset = Object.entries(this.opts.allSettlements)
      .filter(([_, s]) => s.kingdomName === this.opts.kingdom.name);
    for (const [sid, s] of myset) {
      const opt = setSel.createEl('option', { value: sid, text: s.name });
      if (hex.settlementId === sid) opt.selected = true;
    }
    setSel.addEventListener('change', async () => {
      const newId = setSel.value || undefined;
      // If another hex already has this settlement, clear it there first
      if (newId) {
        for (const otherKey of Object.keys(this.opts.kingdom.hexes)) {
          const other = this.opts.kingdom.hexes[otherKey];
          if (other.settlementId === newId && otherKey !== hexKey(hex.q, hex.r)) {
            other.settlementId = undefined;
          }
        }
      }
      hex.settlementId = newId;
      await this.commit();
      this.render();
    });

    // ---- Roads (per edge) ----
    const roadRow = editor.createDiv({ cls: 'km-hex-editor-row km-hex-editor-roads' });
    roadRow.createEl('label', { text: 'Roads' });
    const roadGrid = roadRow.createDiv({ cls: 'km-hex-edge-grid' });
    const edgeNames: Record<HexEdge, string> = { 0: 'NE', 1: 'E', 2: 'SE', 3: 'SW', 4: 'W', 5: 'NW' };
    for (const e of [5, 0, 4, 1, 3, 2] as HexEdge[]) {
      // Layout: NW NE / W E / SW SE — we use edge order [5,0,4,1,3,2]
      const edgeBtn = roadGrid.createEl('button', { text: edgeNames[e] });
      if (hex.roads[e]) edgeBtn.addClass('is-active');
      edgeBtn.addEventListener('click', async () => {
        toggleRoad(this.opts.kingdom, hex.q, hex.r, e);
        await this.commit();
        this.render();
        this.openEditor(hex);
      });
    }

    // ---- Notes ----
    const notesRow = editor.createDiv({ cls: 'km-hex-editor-row' });
    notesRow.createEl('label', { text: 'Hex notes' });
    const notesArea = notesRow.createEl('textarea', { cls: 'km-hex-editor-notes' });
    notesArea.value = hex.notes ?? '';
    notesArea.placeholder = 'Special features, encounters, hooks…';
    notesArea.addEventListener('change', async () => {
      hex.notes = notesArea.value || undefined;
      await this.commit();
    });

    // ---- Danger zone: unclaim ----
    const danger = editor.createDiv({ cls: 'km-hex-editor-danger' });
    const unclaimBtn = danger.createEl('button', { text: 'Unclaim & clear hex', cls: 'mod-warning' });
    unclaimBtn.addEventListener('click', async () => {
      delete this.opts.kingdom.hexes[hexKey(hex.q, hex.r)];
      this.selectedKey = null;
      editor.remove();
      await this.commit();
      this.render();
    });
  }

  // =============================================================
  // Footer (terrain breakdown + warnings)
  // =============================================================
  private renderFooter() {
    const k = this.opts.kingdom;
    const hexes = Object.values(k.hexes).filter(h => h.claimed);
    if (hexes.length === 0) {
      const empty = this.rootEl.createDiv({ cls: 'km-hex-empty-help' });
      empty.createEl('p', { text: 'Click an empty hex to claim your first territory.' });
      return;
    }

    const footer = this.rootEl.createDiv({ cls: 'km-hex-footer' });

    // Terrain breakdown
    const terrCount: Record<Terrain, number> = {
      plains: 0, forest: 0, hills: 0, mountains: 0,
      swamp: 0, desert: 0, wetland: 0, lake: 0,
    };
    for (const h of hexes) terrCount[h.terrain]++;
    const terrBox = footer.createDiv({ cls: 'km-hex-terrain-breakdown' });
    terrBox.createEl('h5', { text: 'Terrain' });
    const terrList = terrBox.createDiv({ cls: 'km-hex-terr-list' });
    for (const t of TERRAINS) {
      if (terrCount[t] === 0) continue;
      const chip = terrList.createSpan({ cls: 'km-hex-terr-chip' });
      const swatch = chip.createSpan({ cls: 'km-hex-terr-swatch' });
      swatch.setAttr('style', `background:${TERRAIN_FILL[t]};border-color:${TERRAIN_STROKE[t]}`);
      chip.appendText(`${TERRAIN_LABELS[t]}: ${terrCount[t]}`);
    }

    // Worksite breakdown
    const wsCount: Record<Worksite, number> = { 'lumber-camp': 0, mine: 0, quarry: 0, farmland: 0 };
    let anyWorksite = false;
    for (const h of hexes) {
      if (h.worksite) {
        wsCount[h.worksite]++;
        anyWorksite = true;
      }
    }
    if (anyWorksite) {
      const wsBox = footer.createDiv({ cls: 'km-hex-worksite-breakdown' });
      wsBox.createEl('h5', { text: 'Worksites' });
      const wsList = wsBox.createDiv({ cls: 'km-hex-ws-list' });
      for (const w of WORKSITES) {
        if (wsCount[w] === 0) continue;
        wsList.createSpan({ cls: 'km-hex-ws-chip', text: `${WORKSITE_LABELS[w]}: ${wsCount[w]}` });
      }
    }

    // Validation warnings
    const warnings: string[] = [];
    for (const h of hexes) {
      if (h.worksite) {
        const allowed = WORKSITE_ALLOWED_TERRAINS[h.worksite];
        if (!allowed.includes(h.terrain)) {
          warnings.push(`(${h.q},${h.r}): ${WORKSITE_LABELS[h.worksite]} is on ${TERRAIN_LABELS[h.terrain]} (not allowed).`);
        }
      }
      if (h.settlementId && !this.opts.allSettlements[h.settlementId]) {
        warnings.push(`(${h.q},${h.r}): linked settlement no longer exists.`);
      }
    }
    if (warnings.length > 0) {
      const warnBox = footer.createDiv({ cls: 'km-hex-warnings' });
      warnBox.createEl('h5', { text: 'Warnings' });
      const ul = warnBox.createEl('ul');
      for (const w of warnings) ul.createEl('li', { text: w });
    }
  }

  // =============================================================
  // Helpers
  // =============================================================
  private async commit() {
    // Sync claimedHexes derived count to the kingdom's status bar
    this.opts.kingdom.claimedHexes = Object.values(this.opts.kingdom.hexes).filter(h => h.claimed).length;
    await this.opts.onKingdomChange(this.opts.kingdom);
  }
}
