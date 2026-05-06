// =============================================================
// KingdomLevelUpModal — multi-step wizard
// =============================================================
// Steps (some skipped depending on target level):
//   1. Confirm: "Level X → Level Y" with summary of what this level grants
//   2. Ability boosts: pick 4 abilities (each gets +2). Hard-blocks over cap.
//      Warns on duplicates (rules-as-written discourage but allow with GM ok).
//   3. Skill increase: pick one ability to promote proficiency (only at lvl 3, 5, 7, 9, ...)
//   4. Feat selection: pick one general feat (only at lvl 2, 4, 6, 8, ...)
//   5. Review: summary of all choices, "Apply" button
//
// Cancel at any step closes without applying.

import { App, Modal, Notice } from 'obsidian';
import {
  abilityCapForLevel,
  applyLevelUp,
  validateBoostsAgainstCap,
  XP_PER_LEVEL,
  type LevelUpChoices,
} from './kingdom';
import {
  ALL_FEATS,
  FEAT_BY_ID,
  FEAT_TYPE_LABELS,
  featsAvailableFor,
  levelGrantsGeneralFeat,
  levelGrantsSkillIncrease,
  type FeatEntry,
} from './feats';
import {
  KINGDOM_ABILITIES,
  KINGDOM_ABILITY_LABELS,
  type KingdomAbility,
  type KingdomState,
  type Proficiency,
} from './types';

type Step = 'confirm' | 'boosts' | 'skill' | 'feat' | 'review';

const PROFICIENCY_NEXT: Record<Proficiency, Proficiency> = {
  untrained: 'trained',
  trained: 'expert',
  expert: 'master',
  master: 'legendary',
  legendary: 'legendary',
};

const PROFICIENCY_LABELS: Record<Proficiency, string> = {
  untrained: 'Untrained',
  trained: 'Trained',
  expert: 'Expert',
  master: 'Master',
  legendary: 'Legendary',
};

export interface KingdomLevelUpOptions {
  kingdom: KingdomState;
  /** Called after applyLevelUp completes; caller persists. */
  onApplied: () => Promise<void>;
}

export class KingdomLevelUpModal extends Modal {
  private opts: KingdomLevelUpOptions;
  private currentStep: Step = 'confirm';
  // Working choices, accumulated across steps
  private choices: LevelUpChoices = {
    boosts: [],
    skillIncrease: undefined,
    generalFeatId: undefined,
  };

  constructor(app: App, opts: KingdomLevelUpOptions) {
    super(app);
    this.opts = opts;
    this.titleEl.setText(`Level up — ${opts.kingdom.name}`);
  }

  onOpen() {
    this.renderCurrentStep();
  }

  onClose() {
    this.contentEl.empty();
  }

  private get newLevel(): number {
    return this.opts.kingdom.level + 1;
  }

  /** Render whichever step we're currently on. */
  private renderCurrentStep() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('km-levelup-modal');

    // Step indicator
    const stepIndicator = contentEl.createDiv({ cls: 'km-levelup-stepbar' });
    const allSteps = this.relevantSteps();
    for (const s of allSteps) {
      const pill = stepIndicator.createSpan({
        cls: 'km-levelup-steppill',
        text: this.stepLabel(s),
      });
      if (s === this.currentStep) pill.addClass('is-active');
      const idx = allSteps.indexOf(s);
      const currentIdx = allSteps.indexOf(this.currentStep);
      if (idx < currentIdx) pill.addClass('is-done');
    }

    switch (this.currentStep) {
      case 'confirm': this.renderConfirmStep(); break;
      case 'boosts': this.renderBoostsStep(); break;
      case 'skill': this.renderSkillStep(); break;
      case 'feat': this.renderFeatStep(); break;
      case 'review': this.renderReviewStep(); break;
    }
  }

  /** Steps actually relevant for this level (skipping skill/feat steps if not applicable). */
  private relevantSteps(): Step[] {
    const steps: Step[] = ['confirm', 'boosts'];
    if (levelGrantsSkillIncrease(this.newLevel)) steps.push('skill');
    if (levelGrantsGeneralFeat(this.newLevel)) steps.push('feat');
    steps.push('review');
    return steps;
  }

  private stepLabel(s: Step): string {
    return ({
      confirm: 'Confirm',
      boosts: 'Boosts',
      skill: 'Skill',
      feat: 'Feat',
      review: 'Review',
    } as const)[s];
  }

  /** Move to the next/prev relevant step. */
  private goNext() {
    const steps = this.relevantSteps();
    const idx = steps.indexOf(this.currentStep);
    if (idx >= 0 && idx < steps.length - 1) {
      this.currentStep = steps[idx + 1];
      this.renderCurrentStep();
    }
  }

  private goPrev() {
    const steps = this.relevantSteps();
    const idx = steps.indexOf(this.currentStep);
    if (idx > 0) {
      this.currentStep = steps[idx - 1];
      this.renderCurrentStep();
    }
  }

  // ===========================================================
  // Step 1: Confirm
  // ===========================================================
  private renderConfirmStep() {
    const k = this.opts.kingdom;
    const { contentEl } = this;

    const intro = contentEl.createDiv({ cls: 'km-levelup-section' });
    intro.createEl('h3', { text: `Advance from level ${k.level} to level ${this.newLevel}` });
    intro.createEl('p', {
      cls: 'km-levelup-paragraph',
      text: `Your kingdom has accumulated ${k.xp} XP. Spending ${XP_PER_LEVEL} XP advances you to the next level. The remaining XP carries forward.`,
    });

    const what = contentEl.createDiv({ cls: 'km-levelup-section' });
    what.createEl('h4', { text: 'This level grants:' });
    const ul = what.createEl('ul', { cls: 'km-levelup-grants' });
    ul.createEl('li', { text: '4 ability boosts (each adds +2 to a chosen ability)' });
    if (levelGrantsSkillIncrease(this.newLevel)) {
      ul.createEl('li', { text: 'Skill increase: promote one ability\'s proficiency by one rank' });
    }
    if (levelGrantsGeneralFeat(this.newLevel)) {
      ul.createEl('li', { text: 'Kingdom feat: pick one general feat from the catalogue' });
    }
    ul.createEl('li', { text: `Ability cap rises to ${abilityCapForLevel(this.newLevel)}` });

    this.renderNavButtons({ next: 'Begin' });
  }

  // ===========================================================
  // Step 2: Ability boosts (4 of them)
  // ===========================================================
  private renderBoostsStep() {
    const k = this.opts.kingdom;
    const cap = abilityCapForLevel(this.newLevel);
    const { contentEl } = this;

    // Ensure we have a 4-slot array
    while (this.choices.boosts.length < 4) {
      // default to first untaken ability that won't violate cap
      const taken = new Set(this.choices.boosts);
      const fallback = (KINGDOM_ABILITIES as KingdomAbility[]).find(
        a => !taken.has(a) && (k.abilities[a] ?? 10) + 2 <= cap,
      ) ?? 'agriculture';
      this.choices.boosts.push(fallback);
    }
    this.choices.boosts.length = 4;

    const sec = contentEl.createDiv({ cls: 'km-levelup-section' });
    sec.createEl('h3', { text: 'Choose 4 ability boosts' });
    sec.createEl('p', {
      cls: 'km-levelup-paragraph',
      text: `Each boost adds +2 to the chosen ability. The cap at level ${this.newLevel} is ${cap}. Per the rules, boosts in the same level-up usually go to four different abilities — but exceptions are allowed at the GM's discretion. Hard violations of the cap are blocked; duplicates only warn.`,
    });

    // Render 4 picker rows, each with current/projected/cap context
    const rows = sec.createDiv({ cls: 'km-levelup-boostrows' });
    for (let i = 0; i < 4; i++) {
      const row = rows.createDiv({ cls: 'km-levelup-boostrow' });
      row.createEl('label', { text: `Boost ${i + 1}` });
      const select = row.createEl('select');
      for (const a of KINGDOM_ABILITIES as KingdomAbility[]) {
        // Compute projected value of this ability if this slot picks it
        const otherBoosts = this.choices.boosts.filter((_, idx) => idx !== i);
        const projected = (k.abilities[a] ?? 10) + 2 + otherBoosts.filter(x => x === a).length * 2;
        const overCap = projected > cap;
        const opt = select.createEl('option', {
          value: a,
          text: `${KINGDOM_ABILITY_LABELS[a]} — ${k.abilities[a] ?? 10} → ${projected}${overCap ? ` (over cap ${cap}!)` : ''}`,
        });
        if (this.choices.boosts[i] === a) opt.selected = true;
        if (overCap) opt.disabled = true;
      }
      select.addEventListener('change', () => {
        this.choices.boosts[i] = select.value as KingdomAbility;
        // Re-render this step so sibling rows update their projected-value tooltips
        this.renderCurrentStep();
      });
    }

    // Soft-warn about duplicates
    const dupCount: Record<string, number> = {};
    for (const a of this.choices.boosts) dupCount[a] = (dupCount[a] ?? 0) + 1;
    const dups = Object.entries(dupCount).filter(([_, n]) => n > 1).map(([a, n]) => `${a} (${n}×)`);
    if (dups.length > 0) {
      const warn = sec.createDiv({ cls: 'km-levelup-warn' });
      warn.createEl('strong', { text: 'Heads up: ' });
      warn.appendText(`Multiple boosts to the same ability: ${dups.join(', ')}. The rules generally discourage this, but it's allowed if the GM permits.`);
    }

    // Hard-validate; surface error and disable Next if cap is violated
    const violation = validateBoostsAgainstCap(k, this.choices.boosts, this.newLevel);
    if (violation) {
      const err = sec.createDiv({ cls: 'km-levelup-error' });
      err.createEl('strong', { text: 'Cannot proceed: ' });
      err.appendText(`Boost would push ${violation.ability} to ${violation.current + 2}, over the cap of ${violation.cap} for level ${this.newLevel}.`);
    }

    this.renderNavButtons({
      back: 'Back',
      next: 'Next',
      nextDisabled: !!violation,
    });
  }

  // ===========================================================
  // Step 3: Skill increase
  // ===========================================================
  private renderSkillStep() {
    const k = this.opts.kingdom;
    const { contentEl } = this;
    const sec = contentEl.createDiv({ cls: 'km-levelup-section' });
    sec.createEl('h3', { text: 'Choose a skill to increase' });
    sec.createEl('p', {
      cls: 'km-levelup-paragraph',
      text: `Pick one ability whose proficiency rank advances by one step (e.g., Trained → Expert). The chosen skill becomes your kingdom's specialty going forward.`,
    });

    if (!this.choices.skillIncrease) {
      // default to a sensible non-legendary one
      const candidate = (KINGDOM_ABILITIES as KingdomAbility[]).find(
        a => k.proficiencies[a] !== 'legendary',
      );
      this.choices.skillIncrease = candidate;
    }

    const row = sec.createDiv({ cls: 'km-levelup-skillrow' });
    row.createEl('label', { text: 'Skill' });
    const select = row.createEl('select');
    for (const a of KINGDOM_ABILITIES as KingdomAbility[]) {
      const current = k.proficiencies[a];
      const next = PROFICIENCY_NEXT[current];
      const isMaxed = current === 'legendary';
      const opt = select.createEl('option', {
        value: a,
        text: isMaxed
          ? `${KINGDOM_ABILITY_LABELS[a]} — Legendary (already maxed)`
          : `${KINGDOM_ABILITY_LABELS[a]} — ${PROFICIENCY_LABELS[current]} → ${PROFICIENCY_LABELS[next]}`,
      });
      if (this.choices.skillIncrease === a) opt.selected = true;
      if (isMaxed) opt.disabled = true;
    }
    select.addEventListener('change', () => {
      this.choices.skillIncrease = select.value as KingdomAbility;
    });

    if (this.choices.skillIncrease && k.proficiencies[this.choices.skillIncrease] === 'legendary') {
      const warn = sec.createDiv({ cls: 'km-levelup-warn' });
      warn.appendText(`Already legendary; cannot promote further. Pick another skill.`);
    }

    this.renderNavButtons({
      back: 'Back',
      next: 'Next',
      nextDisabled: !this.choices.skillIncrease || k.proficiencies[this.choices.skillIncrease] === 'legendary',
    });
  }

  // ===========================================================
  // Step 4: Feat selection
  // ===========================================================
  private renderFeatStep() {
    const k = this.opts.kingdom;
    const { contentEl } = this;
    const sec = contentEl.createDiv({ cls: 'km-levelup-section' });
    sec.createEl('h3', { text: 'Choose a kingdom feat' });
    sec.createEl('p', {
      cls: 'km-levelup-paragraph',
      text: `Pick one general kingdom feat appropriate to level ${this.newLevel} or below. Feats grant ongoing bonuses or unlock new options. Their mechanical effects are GM-adjudicated at the table; this picker just records which ones you've chosen.`,
    });

    const available = featsAvailableFor(k.feats, this.newLevel, k.heartland, k.government, 'general');
    if (available.length === 0) {
      const warn = sec.createDiv({ cls: 'km-levelup-warn' });
      warn.appendText('No general feats available for this level. (You may have already taken all eligible feats.) You can skip this step.');
      this.renderNavButtons({ back: 'Back', next: 'Skip' });
      return;
    }

    if (!this.choices.generalFeatId) {
      // Pre-pick the first available (so the dropdown reflects a valid choice)
      this.choices.generalFeatId = available[0].id;
    }

    // Group by level for readability
    const byLevel: Map<number, FeatEntry[]> = new Map();
    for (const f of available) {
      if (!byLevel.has(f.level)) byLevel.set(f.level, []);
      byLevel.get(f.level)!.push(f);
    }
    const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b);

    const row = sec.createDiv({ cls: 'km-levelup-featrow' });
    row.createEl('label', { text: 'Feat' });
    const select = row.createEl('select', { cls: 'km-levelup-featselect' });
    for (const lvl of sortedLevels) {
      const grp = select.createEl('optgroup');
      grp.label = `Level ${lvl}`;
      for (const f of byLevel.get(lvl)!) {
        const opt = grp.createEl('option', { value: f.id, text: f.name });
        if (this.choices.generalFeatId === f.id) opt.selected = true;
      }
    }
    select.addEventListener('change', () => {
      this.choices.generalFeatId = select.value;
      this.renderCurrentStep();
    });

    // Description of currently-selected feat
    if (this.choices.generalFeatId) {
      const feat = FEAT_BY_ID[this.choices.generalFeatId];
      if (feat) {
        const desc = sec.createDiv({ cls: 'km-levelup-featdesc' });
        desc.createEl('h5', { text: `${feat.name} — Level ${feat.level}` });
        if (feat.prereqText) {
          desc.createEl('p', { cls: 'km-levelup-prereq', text: `Prerequisite: ${feat.prereqText}` });
        }
        desc.createEl('p', { cls: 'km-levelup-paragraph', text: feat.description });
      }
    }

    // Optional skip — feats are nice but not strictly required to advance
    const skipRow = sec.createDiv({ cls: 'km-levelup-skiprow' });
    const skipCb = skipRow.createEl('input', { type: 'checkbox' });
    skipCb.checked = !this.choices.generalFeatId;
    const skipLbl = skipRow.createEl('label', { text: ' Skip feat selection (you can pick one later via the kingdom sheet)' });
    skipCb.addEventListener('change', () => {
      this.choices.generalFeatId = skipCb.checked ? undefined : (available[0]?.id);
      this.renderCurrentStep();
    });

    this.renderNavButtons({ back: 'Back', next: 'Next' });
  }

  // ===========================================================
  // Step 5: Review and apply
  // ===========================================================
  private renderReviewStep() {
    const k = this.opts.kingdom;
    const { contentEl } = this;
    const sec = contentEl.createDiv({ cls: 'km-levelup-section' });
    sec.createEl('h3', { text: 'Review and apply' });
    sec.createEl('p', {
      cls: 'km-levelup-paragraph',
      text: `Verify your choices below. Clicking Apply will spend ${XP_PER_LEVEL} XP, advance to level ${this.newLevel}, and update the kingdom record. This action is reversible only by manual editing of the kingdom sheet.`,
    });

    const summary = sec.createDiv({ cls: 'km-levelup-reviewbox' });

    // Level
    summary.createEl('div', { cls: 'km-levelup-reviewline', text: `Level: ${k.level} → ${this.newLevel}` });

    // Boosts
    const boostLine = summary.createDiv({ cls: 'km-levelup-reviewline' });
    boostLine.createEl('strong', { text: 'Ability boosts: ' });
    boostLine.appendText(this.choices.boosts.map(b => `+2 ${KINGDOM_ABILITY_LABELS[b]}`).join(', '));

    // Skill
    if (this.choices.skillIncrease) {
      const current = k.proficiencies[this.choices.skillIncrease];
      const next = PROFICIENCY_NEXT[current];
      const skLine = summary.createDiv({ cls: 'km-levelup-reviewline' });
      skLine.createEl('strong', { text: 'Skill increase: ' });
      skLine.appendText(`${KINGDOM_ABILITY_LABELS[this.choices.skillIncrease]} ${PROFICIENCY_LABELS[current]} → ${PROFICIENCY_LABELS[next]}`);
    }

    // Feat
    if (this.choices.generalFeatId) {
      const feat = FEAT_BY_ID[this.choices.generalFeatId];
      const ftLine = summary.createDiv({ cls: 'km-levelup-reviewline' });
      ftLine.createEl('strong', { text: 'Kingdom feat: ' });
      ftLine.appendText(feat?.name ?? this.choices.generalFeatId);
    }

    this.renderNavButtons({
      back: 'Back',
      next: `Apply — advance to Lvl ${this.newLevel}`,
      nextIsCta: true,
      nextHandler: async () => {
        try {
          applyLevelUp(k, this.choices);
          await this.opts.onApplied();
          new Notice(`Kingdom advanced to level ${this.newLevel}.`);
          this.close();
        } catch (e) {
          new Notice(`Could not apply level-up: ${(e as Error).message}`);
        }
      },
    });
  }

  // ===========================================================
  // Shared nav button renderer
  // ===========================================================
  private renderNavButtons(opts: {
    back?: string;
    next?: string;
    nextDisabled?: boolean;
    nextIsCta?: boolean;
    nextHandler?: () => Promise<void> | void;
  }) {
    const buttons = this.contentEl.createDiv({ cls: 'km-levelup-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    if (opts.back) {
      const backBtn = buttons.createEl('button', { text: opts.back });
      backBtn.addEventListener('click', () => this.goPrev());
    }

    if (opts.next) {
      const nextBtn = buttons.createEl('button', {
        text: opts.next,
        cls: opts.nextIsCta ? 'mod-cta' : '',
      });
      if (opts.nextDisabled) nextBtn.disabled = true;
      nextBtn.addEventListener('click', () => {
        if (opts.nextHandler) opts.nextHandler();
        else this.goNext();
      });
    }
  }
}
