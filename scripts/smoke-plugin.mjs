import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { parse, stringify } from 'yaml';

// Exercise the shipped bundle against the host API without mounting a browser UI.
class TFile { constructor(path) { this.path = path; } }
class TFolder { constructor(path) { this.path = path; } }
class Plugin {
  views = new Map();
  commands = new Map();
  ribbons = [];
  async loadData() { return this.stored; }
  async saveData(value) { this.stored = JSON.parse(JSON.stringify(value)); }
  registerView(type, factory) { this.views.set(type, factory); }
  addCommand(command) { this.commands.set(command.id, command); }
  addRibbonIcon(...args) { this.ribbons.push(args); }
  addSettingTab(tab) { this.settingTab = tab; }
  registerEvent() {}
}
const host = {
  Plugin, TFile, TFolder, ItemView: class {}, Modal: class {},
  PluginSettingTab: class { constructor(app) { this.app = app; } },
  normalizePath: path => path.replace(/\\/g, '/').replace(/\/+/g, '/'),
  parseYaml: parse, stringifyYaml: stringify,
};
const module = { exports: {} };
vm.runInNewContext(readFileSync('main.js', 'utf8'), {
  module, exports: module.exports, console, crypto,
  require(name) { assert.equal(name, 'obsidian', 'Bundle must only require the Obsidian host'); return host; },
});
const PluginClass = module.exports.default;
const routinePath = 'routines/custom.md';
const sourceCard = { id: 'wake', title: 'Wake up', notes: '', category: '', days: [1], isTimed: true, startTime: '07:00', endTime: '', color: 'blue', order: 0 };
function fixture(stored = {}, legacy = { startHour: 5, endHour: 22, storageMode: 'daily', dailyNotesFolder: 'Journal', defaultDuration: 45 }) {
  const routine = `---\n${stringify({ weekly_routine_board: true, cards: [sourceCard] })}---\n`;
  const files = new Map([[routinePath, new TFile(routinePath)]]);
  const contents = new Map([[routinePath, routine], ['.custom-config/plugins/day-canvas/data.json', JSON.stringify(legacy)]]);
  const events = new Map();
  const plugin = new PluginClass();
  plugin.stored = { notePath: routinePath, ...stored };
  const vault = {
    configDir: '.custom-config',
    getAbstractFileByPath: path => files.get(path) ?? null,
    read: async file => contents.get(file.path),
    modify: async (file, content) => { contents.set(file.path, content); },
    createFolder: async path => { files.set(path, new TFolder(path)); },
    create: async (path, content) => { const file = new TFile(path); files.set(path, file); contents.set(path, content); return file; },
    process: async (file, transform) => { contents.set(file.path, transform(contents.get(file.path))); },
    on: (event, callback) => { const handlers = events.get(event) ?? []; handlers.push(callback); events.set(event, handlers); return {}; },
    adapter: {
      exists: async path => contents.has(path), read: async path => contents.get(path),
      write: async (path, content) => { contents.set(path, content); }, mkdir: async () => {},
    },
  };
  plugin.app = { vault, workspace: { getLeavesOfType: () => [] } };
  return { plugin, contents, routine, events };
}

void test('shipped plugin upgrades weekly data, registers both views, and adopts standalone settings once', async () => {
  const { plugin, contents, routine } = fixture();
  await plugin.onload();
  assert.equal(plugin.views.size, 2);
  assert.ok(plugin.views.has('weekly-routine-board-view'));
  assert.ok(plugin.views.has('weekly-routine-board-day-canvas'));
  assert.ok(plugin.commands.has('open-weekly-board'));
  assert.ok(plugin.commands.has('open-day-canvas'));
  assert.equal(plugin.ribbons.length, 1);
  assert.equal(plugin.settings.cards[0].id, 'wake');
  assert.equal(contents.get(routinePath), routine);
  assert.equal(plugin.settings.dayCanvas.dailyNotesFolder, 'Journal');
  assert.equal(plugin.settings.dayCanvas.startHour, 5);
  assert.equal(plugin.dayRepository.settings.routinesFilePath, routinePath);
  assert.equal(plugin.dayRepository.pathFor('2026-11-10'), 'Journal/2026-11-10.md');
  assert.equal(plugin.stored.dayCanvas.defaultDuration, 45);
  const plan = await plugin.dayRepository.load('2026-11-10');
  assert.equal(plan.blocks[0].title, 'Wake up');
  assert.equal(plan.blocks[0].endTime, undefined);
  assert.equal(contents.get(routinePath), routine);
});

void test('shipped plugin retains integrated settings instead of reapplying legacy settings', async () => {
  const { plugin } = fixture({ dayCanvas: { startHour: 8, endHour: 20, storageMode: 'dedicated', plansFolder: 'My plans' } });
  await plugin.onload();
  assert.equal(plugin.settings.dayCanvas.startHour, 8);
  assert.equal(plugin.dayRepository.pathFor('2026-11-10'), 'My plans/2026-11-10.md');
  assert.ok(plugin.settingTab.getSettingDefinitions().some(setting => setting.name === 'Day canvas storage'));
});

void test('shipped plugin forwards Markdown changes and shares routine edits with the daily repository', async () => {
  const { plugin, events } = fixture();
  await plugin.onload();
  const notifications = [];
  plugin.dayRepository.subscribe(path => { notifications.push(path); });
  for (const callback of events.get('modify')) await callback(new TFile('Journal/2026-11-10.md'));
  assert.ok(notifications.includes('Journal/2026-11-10.md'));
  await plugin.upsertCard({ ...sourceCard, title: 'Morning routine' });
  const plan = await plugin.dayRepository.load('2026-11-17');
  assert.equal(plan.blocks[0].title, 'Morning routine');
  assert.equal(plugin.stored.cards[0].title, 'Morning routine');
});
