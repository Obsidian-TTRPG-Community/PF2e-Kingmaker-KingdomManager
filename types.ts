// =============================================================
// KingdomManagerSettingsTab — plugin settings + getting-started UI
// =============================================================
// Obsidian's standard PluginSettingTab. Currently the plugin has no
// configurable settings (everything is per-kingdom data, edited in the
// codeblocks themselves), so this page is purely informational:
//   - About the plugin (what it does, who it's for)
//   - Getting started (Command Palette commands)
//   - Commands reference
//   - Optional Reset / Reload-images affordances surfaced from the palette

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type KingdomManagerPlugin from './main';

/** Settings tab for the Kingdom Manager plugin. Configures nothing — informational only. */
export class KingdomManagerSettingsTab extends PluginSettingTab {
  private plugin: KingdomManagerPlugin;

  constructor(app: App, plugin: KingdomManagerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('km-settings');

    // ---- About section ----
    containerEl.createEl('h2', { text: 'PF2e Kingmaker - Kingdom Manager' });
    const about = containerEl.createDiv({ cls: 'km-settings-about' });
    about.createEl('p', {
      text: 'A digital kingdom-management tracker for Pathfinder 2e Kingmaker. Replaces the paper Kingdom Management Tracker with editable codeblocks for the kingdom sheet, hex map, settlement urban grids, per-turn activity workflow, army roster, event resolution, and level-up wizard.',
    });
    about.createEl('p', {
      cls: 'km-settings-mut',
      text: 'The plugin\'s philosophy is "half-auto": the engine rolls dice, classifies success tiers, and tracks state, but every applied effect goes through a confirm/override step so the GM can make table-side adjudications without fighting the tool.',
    });

    // ---- Getting started ----
    containerEl.createEl('h3', { text: 'Getting started' });
    const started = containerEl.createDiv({ cls: 'km-settings-section' });
    started.createEl('p', {
      text: 'Open any note where you want to track a kingdom, open the Command Palette (Ctrl/Cmd+P), and run:',
    });
    const startedList = started.createEl('ol');
    const li1 = startedList.createEl('li');
    li1.createEl('strong', { text: 'Set up new kingdom (insert blocks at cursor)' });
    li1.appendText(' — opens a wizard for kingdom name, level, government, alignment, charter, heartland, language, and capital settlement. Pre-creates the kingdom record and inserts every codeblock at your cursor.');
    started.createEl('p', {
      text: 'Tip: rename the note to match your kingdom name (e.g. "Brevoy Reborn") so Obsidian wiki-links from session notes and NPC pages just work.',
    });

    // ---- Commands reference ----
    containerEl.createEl('h3', { text: 'Commands reference' });
    const cmdSec = containerEl.createDiv({ cls: 'km-settings-section' });
    const cmdList = cmdSec.createEl('ul', { cls: 'km-settings-cmdlist' });
    const cmds: { name: string; desc: string }[] = [
      { name: 'Set up new kingdom (insert blocks at cursor)', desc: 'Main onboarding wizard. Creates a kingdom and inserts the chosen codeblocks.' },
      { name: 'Level up kingdom (open wizard)', desc: 'Opens the level-up wizard if any kingdom has ≥1000 XP. Walks through ability boosts, skill increases, and feat selection.' },
      { name: 'Insert kingdom sheet codeblock', desc: 'Inserts a single `kingdom-sheet` block referencing the most recently used kingdom.' },
      { name: 'Insert kingdom turn codeblock', desc: 'Inserts a single `kingdom-turn` block (per-turn activity workflow).' },
      { name: 'Insert kingdom hex map codeblock', desc: 'Inserts a single `kingdom-hex` block (territory map).' },
      { name: 'Insert kingdom armies codeblock', desc: 'Inserts a single `kingdom-armies` block (army roster).' },
      { name: 'Insert kingdom events codeblock', desc: 'Inserts a single `kingdom-events` block (event resolution log).' },
      { name: 'Insert settlement codeblock', desc: 'Inserts a single `kingdom-settlement` block for a new settlement.' },
      { name: 'Reload building images from plugin folder', desc: 'Re-scans the plugin folder for PNGs to use as building art overrides. Run this after dropping new images into building_images/.' },
      { name: 'Reset ALL settlement & kingdom data (irreversible)', desc: 'Wipes every kingdom and settlement record this plugin has stored. There is no undo.' },
    ];
    for (const c of cmds) {
      const li = cmdList.createEl('li');
      li.createEl('strong', { text: c.name });
      li.appendText(` — ${c.desc}`);
    }

    // ---- Codeblock reference ----
    containerEl.createEl('h3', { text: 'Codeblocks reference' });
    const blockSec = containerEl.createDiv({ cls: 'km-settings-section' });
    const blockList = blockSec.createEl('ul', { cls: 'km-settings-cmdlist' });
    const blocks: { name: string; desc: string }[] = [
      { name: 'kingdom-hex', desc: 'Territory map with terrain, worksites, and roads.' },
      { name: 'kingdom-settlement', desc: 'Urban-grid editor for a single settlement.' },
      { name: 'kingdom-sheet', desc: 'Identity, abilities, ruin, leadership, kingdom feats, roll-up. The main bookkeeping view.' },
      { name: 'kingdom-turn', desc: 'Per-turn activity workflow with phase pills and half-auto rolling.' },
      { name: 'kingdom-armies', desc: 'Editable army stat blocks with tactics and gear.' },
      { name: 'kingdom-events', desc: 'Active and historical events; resolution and continuous-event ticking.' },
    ];
    for (const b of blocks) {
      const li = blockList.createEl('li');
      li.createEl('code', { text: b.name });
      li.appendText(` — ${b.desc}`);
    }

    // ---- Catalogue accuracy disclaimer ----
    const accBox = containerEl.createDiv({ cls: 'km-settings-disclaimer' });
    accBox.createEl('h4', { text: 'Note on rules-text accuracy' });
    accBox.createEl('p', {
      text: 'The plugin includes catalogues for buildings (~47 entries), kingdom activities (~30), kingdom events (~20), army tactics (~45), war gear (~18), and kingdom feats (~50). All catalogue data is best-effort modelled from the Pathfinder Kingmaker AP appendices. Specific level prerequisites, RP costs, and outcome deltas may diverge from your printing in places.',
    });
    accBox.createEl('p', {
      text: 'The half-auto resolution flow is designed to handle this: every roll/outcome dialog has an "Override outcome" dropdown and a "GM notes" field. Per-army "House rules / overrides" and per-event "Notes" fields let you record table-side adjudications. Treat the plugin as a fast scaffold for kingdom bookkeeping, not as a replacement for the rulebook.',
    });

    // ---- Paizo product links ----
    containerEl.createEl('h3', { text: 'Get the Adventure Path' });
    const paizoSec = containerEl.createDiv({ cls: 'km-settings-section km-settings-paizo' });
    paizoSec.createEl('p', {
      text: 'This plugin is a companion tool — it scaffolds the bookkeeping but is not a replacement for the published rules. If you\'re running Kingmaker, please support Paizo by buying the Adventure Path.',
    });
    const paizoList = paizoSec.createEl('ul', { cls: 'km-settings-paizo-links' });

    const apItem = paizoList.createEl('li');
    const apLink = apItem.createEl('a', {
      text: 'Pathfinder Kingmaker Adventure Path (paizo.com)',
      attr: {
        href: 'https://store.paizo.com/pathfinder/pathfinder-second-edition/adventure-paths/kingmaker/',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    });
    apItem.appendText(' — the full 640-page hardcover, including kingdom rules, warfare rules, and the AP itself. The product line also includes the Kingmaker Companion Guide, Kingdom Management Screen, and Poster Map Folio.');

    const pgItem = paizoList.createEl('li');
    pgItem.createEl('a', {
      text: 'Kingmaker Player\'s Guide (free PDF, paizo.com)',
      attr: {
        href: 'https://paizo.com/products/btpy8dqh',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    });
    pgItem.appendText(' — a free, spoiler-safe player\'s guide containing the kingdom-building and warfare rules in a context players can read. If you want to verify what the plugin\'s catalogues are paraphrasing, this is the canonical source.');

    // ---- Maintenance affordances ----
    containerEl.createEl('h3', { text: 'Maintenance' });

    new Setting(containerEl)
      .setName('Reload building images')
      .setDesc('Re-scan <plugin folder>/building_images/ for PNG overrides. Run after adding or removing token art.')
      .addButton(btn =>
        btn
          .setButtonText('Reload images')
          .onClick(async () => {
            const count = await this.plugin.loadImageOverridesPublic();
            new Notice(`Loaded ${count} building image override(s).`);
          }),
      );

    new Setting(containerEl)
      .setName('Reset all data')
      .setDesc('Permanently wipe every kingdom and settlement record this plugin has stored. There is no undo.')
      .addButton(btn =>
        btn
          .setButtonText('Reset everything')
          .setWarning()
          .onClick(async () => {
            const confirmed = confirm(
              'Permanently wipe every kingdom and settlement record stored by Kingdom Manager? This cannot be undone.',
            );
            if (!confirmed) return;
            await this.plugin.resetAllDataPublic();
            new Notice('All Kingdom Manager data wiped.');
          }),
      );

    // ---- Legal & acknowledgements ----
    containerEl.createEl('h3', { text: 'Legal & acknowledgements' });
    const legal = containerEl.createDiv({ cls: 'km-settings-legal' });

    legal.createEl('h4', { text: 'Plugin code: MIT License' });
    legal.createEl('p', {
      text: 'The plugin\'s code is released under the MIT License. The full text is in the LICENSE file in the plugin folder. You\'re free to fork, modify, and redistribute the code; please retain attribution.',
    });

    legal.createEl('h4', { text: 'Paizo Community Use' });
    const cuPara = legal.createEl('p');
    cuPara.appendText(
      'This plugin uses trademarks and/or copyrights owned by Paizo Inc., used under Paizo\'s Community Use Policy. We are expressly prohibited from charging you to use or access this content. This plugin is not published, endorsed, or specifically approved by Paizo. For more information about Paizo\'s Community Use Policy, please visit ',
    );
    cuPara.createEl('a', {
      text: 'paizo.com/communityuse',
      attr: {
        href: 'https://paizo.com/communityuse',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    });
    cuPara.appendText('. For more information about Paizo Inc. and Paizo products, please visit ');
    cuPara.createEl('a', {
      text: 'paizo.com',
      attr: {
        href: 'https://paizo.com',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    });
    cuPara.appendText('.');

    legal.createEl('h4', { text: 'Building art pack (separate)' });
    legal.createEl('p', {
      text: 'The separately-distributed building art pack contains derivative imagery of Paizo\'s published Kingmaker token art and is for personal use only. It is NOT covered by the MIT License above and ships separately from the main plugin release for that reason.',
    });

    // ---- Version footer ----
    const footer = containerEl.createDiv({ cls: 'km-settings-footer' });
    const manifestVersion = (this.plugin.manifest as { version?: string }).version ?? '?';
    footer.createSpan({ text: `PF2e Kingmaker - Kingdom Manager v${manifestVersion}` });
  }
}
