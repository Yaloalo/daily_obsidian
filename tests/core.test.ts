import test from 'node:test';
import assert from 'node:assert/strict';
import { TFile, TFolder, type App } from 'obsidian';
import { emptyPlan, DEFAULT_SETTINGS, type DayPlan, type DayCanvasSettings } from '../src/dayCanvas/types';
import { dateKey, shiftDate, minutes, timeString } from '../src/dayCanvas/time';
import { mergeChanges, needsPointMigration, readPlan, writePlan, parseTask } from '../src/dayCanvas/markdown';
import { importRoutines, migrateRoutinePoints, readRoutines } from '../src/dayCanvas/routines';
import { DayPlanRepository, vaultPath } from '../src/dayCanvas/repository';
import { isVisible, layoutBlocks } from '../src/dayCanvas/layout';
import { dropTimeAtPointer, firstFreeTime, moveBlock, setBlockTime } from '../src/dayCanvas/scheduling';

const date = '2026-11-10'; // Tuesday, in the weekly board's Monday-first convention.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const block = (id = 'block-1', startTime = '07:30', endTime = '08:30') => ({ id, title: 'Sport', completed: false, color: 'teal' as const, startTime, endTime });
function populated(): DayPlan {
	return { date, routineIds: ['board-sport'], blocks: [{ ...block(), routineId: 'board-sport' }], backlog: [{ id: 'task-1', title: 'Wäsche', completed: true, color: 'purple' }] };
}

class MemoryVault {
	files = new Map<string, TFile | TFolder>();
	contents = new Map<string, string>();
	writes = 0;
	fail = false;
	beforeProcess?: () => void;
	getAbstractFileByPath = (path: string) => this.files.get(path) ?? null;
	async read(file: TFile) { return this.contents.get(file.path) ?? ''; }
	async createFolder(path: string) { this.files.set(path, Object.assign(Object.create(TFolder.prototype) as TFolder, { path })); }
	async create(path: string, content: string) {
		if (this.fail) throw new Error('Disk full');
		if (this.files.has(path)) throw new Error('Already exists');
		const file = Object.assign(Object.create(TFile.prototype), { path }) as TFile;
		this.files.set(path, file); this.contents.set(path, content); this.writes++;
		return file;
	}
	async process(file: TFile, transform: (content: string) => string) {
		if (this.fail) throw new Error('Disk full');
		this.beforeProcess?.();
		this.beforeProcess = undefined;
		const content = transform(this.contents.get(file.path) ?? '');
		this.contents.set(file.path, content); this.writes++;
		return content;
	}
}
function fixture(overrides: Partial<DayCanvasSettings> = {}) {
	const vault = new MemoryVault();
	const settings = { ...DEFAULT_SETTINGS, ...overrides };
	const repository = new DayPlanRepository({ vault } as unknown as App, () => settings);
	return { vault, settings, repository };
}

void test('local date keys and navigation survive timezone boundaries and DST', () => {
	assert.equal(dateKey(new Date(2026, 10, 10, 0, 1)), date);
	assert.equal(shiftDate('2026-03-29', -1), '2026-03-28');
	assert.equal(shiftDate('2026-10-25', 1), '2026-10-26');
	assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
	assert.equal(timeString(1440), '24:00');
	assert.ok(Number.isNaN(minutes('24:01')));
	assert.ok(Number.isNaN(minutes('12:60')));
});

void test('Markdown round-trips identity, times, completion, colors and routine history', () => {
	const plan = populated();
	const content = writePlan('# Tuesday\n', plan);
	assert.match(content, /- \[ \] 07:30 - 08:30 Sport/);
	assert.match(content, /- \[x\] Wäsche/);
	assert.deepEqual(readPlan(content, date), plan);
	assert.equal(writePlan(content, plan), content);
	assert.deepEqual(readPlan(content.replace('- [ ]', '- [x]'), date).blocks[0], { ...plan.blocks[0], completed: true });
});

void test('editing only the Timeblocks section preserves other tasks, prose, YAML, code and CRLF', () => {
	const original = '---\r\ntags: [daily]\r\n---\r\n# Tuesday\r\n- [ ] unrelated\r\n\r\n## Timeblocks\r\nKeep this paragraph.\r\n```md\r\n## Not a section\r\n- [ ] code sample\r\n```\r\n- [ ] 07:00 - 08:00 Sport\r\n- [ ] 25:00 - 26:00 invalid\r\n\r\n## Journal\r\nMy journal.\r\n- [ ] journal task\r\n';
	const plan = readPlan(original, date);
	assert.equal(plan.blocks.length, 1);
	assert.equal(plan.backlog.length, 0);
	plan.blocks[0].completed = true;
	const saved = writePlan(original, plan);
	assert.ok(saved.startsWith(original.slice(0, original.indexOf('## Timeblocks'))));
	assert.ok(saved.endsWith('## Journal\r\nMy journal.\r\n- [ ] journal task\r\n'));
	assert.ok(saved.includes('Keep this paragraph.\r\n```md\r\n## Not a section\r\n- [ ] code sample\r\n```'));
	assert.ok(saved.includes('- [ ] 25:00 - 26:00 invalid'));
	assert.ok(!/(?<!\r)\n/.test(saved));
});

void test('a heading inside a code fence does not become the managed section', () => {
	const content = '```md\n## Timeblocks\n- [ ] example\n```\n## Journal\nhello\n';
	const saved = writePlan(content, populated());
	assert.ok(saved.startsWith(content.trimEnd()));
	assert.equal(readPlan(saved, date).backlog.length, 1);
});

void test('partially edited empty titles and metadata-like text survive a save', () => {
	const plan = populated();
	plan.blocks[0].title = '';
	plan.backlog[0].title = '';
	assert.deepEqual(readPlan(writePlan('', plan), date), plan);
	plan.backlog[0].title = 'Explain <!-- dc:{"id":"example"} -->';
	assert.deepEqual(readPlan(writePlan('', plan), date), plan);
});

void test('plain Markdown tasks gain stable ids and backlog time-like titles remain unscheduled', () => {
	const first = readPlan('## Timeblocks\n- [ ] 07:00 Sport\n- [ ] Sport\n- [ ] Sport\n', date);
	assert.equal(new Set([...first.blocks, ...first.backlog].map(task => task.id)).size, 3);
	const checked = readPlan('## Timeblocks\n- [x] 07:30 Sport\n- [ ] Sport\n- [ ] Sport\n', date);
	assert.equal(first.blocks[0].id, checked.blocks[0].id);
	first.backlog[0].title = '09:00 Call the dentist';
	assert.equal(readPlan(writePlan('', first), date).backlog[0].title, '09:00 Call the dentist');
	assert.equal(parseTask('- [ ] 23:50 Late task', 'late')?.title, 'Late task');
	assert.equal((parseTask('- [ ] 23:50 Late task', 'late') as ReturnType<typeof block>).endTime, undefined);
	assert.equal(parseTask('- [ ] 08:00 - 07:00 Bad', 'bad'), null);
});

void test('live merge preserves remote checkbox/title edits while applying local time edits', () => {
	const base = populated();
	const local = clone(base); local.blocks[0].startTime = '07:45';
	const remote = clone(base); remote.blocks[0].completed = true; remote.blocks[0].title = 'Workout';
	remote.backlog.push({ id: 'remote', title: 'Added in Markdown', completed: false, color: 'blue' });
	const merged = mergeChanges(base, local, remote);
	assert.deepEqual(merged.blocks[0], { ...local.blocks[0], completed: true, title: 'Workout' });
	assert.equal(merged.backlog.length, 2);
	assert.equal(mergeChanges(base, local, { ...remote, blocks: [] }).blocks.length, 0);
});

void test('scheduling and unscheduling preserve identity; simultaneous time edits stay valid', () => {
	const base = populated();
	const local = clone(base);
	const { startTime, endTime, ...task } = local.blocks.pop()!;
	local.backlog.push(task);
	const unscheduled = mergeChanges(base, local, base);
	assert.deepEqual(unscheduled.blocks, []);
	assert.deepEqual(unscheduled.backlog.find(item => item.id === task.id), task);
	const localTime = clone(base); localTime.blocks[0].startTime = '08:00';
	const remote = clone(base); remote.blocks[0].endTime = '07:45';
	const merged = mergeChanges(base, localTime, remote);
	assert.equal(merged.blocks[0].startTime, '08:00');
	assert.equal(merged.blocks[0].endTime, '08:30');
});

void test('Weekly Routine Board YAML is authoritative, Monday-first, with independent completion', () => {
	const cards = [
		{ id: 'sport', title: 'Sport', days: [1], isTimed: true, startTime: '07:00', endTime: '08:00', color: 'green' },
		{ id: 'english', title: 'English', days: [1], isTimed: true, startTime: '08:00', endTime: '' },
		{ id: 'laundry', title: 'Wäsche', days: [1], isTimed: false, color: 'purple' },
		{ id: 'monday', title: 'Monday only', days: [0], isTimed: false }
	];
	const source = `---\n${JSON.stringify({ weekly_routine_board: true, cards })}\n---\n## Tuesday\n- [ ] Duplicate representation\n`;
	const routines = readRoutines(source, date, JSON.parse);
	assert.equal(routines.length, 3);
	assert.equal((routines[1] as ReturnType<typeof block>).endTime, undefined);
	assert.equal(routines[2].color, 'purple');
	const plan = emptyPlan(date);
	assert.equal(importRoutines(plan, routines), true);
	plan.blocks[0].completed = true;
	plan.backlog = [];
	assert.equal(importRoutines(plan, routines), false);
	assert.equal(plan.backlog.length, 0);
	assert.equal(plan.blocks[0].completed, true);
});

void test('Markdown weekly routines support German/English headings, subsections and midnight', () => {
	const source = '# Week\n## Monday\n- [ ] Wrong day\n## Dienstag\n- [x] 07:00 Aufstehen\n### Chores\n- Putzen\n- [ ] 23:45 - 24:00 Wind down\n```\n- [ ] Ignore me\n```\n## Wednesday\n- [ ] Wrong day too\n';
	const tasks = readRoutines(source, date, JSON.parse);
	assert.equal(tasks.length, 3);
	assert.equal(tasks[0].completed, false);
	assert.equal(tasks[1].title, 'Putzen');
	assert.equal((tasks[2] as ReturnType<typeof block>).endTime, '24:00');
	const plan = emptyPlan(date);
	plan.blocks.push(block('manual', '07:00', '07:30'));
	plan.blocks[0].title = 'Aufstehen';
	importRoutines(plan, tasks);
	assert.equal(plan.blocks.length, 2);
});

void test('layout scales duration, handles clipping, overlaps and adjacent intervals', () => {
	const items = layoutBlocks([block('a', '06:30', '08:00'), block('b', '07:30', '08:30'), block('c', '08:30', '09:00'), block('hidden', '23:00', '24:00')], 7 * 60, 10 * 60, 2);
	assert.equal(items.length, 3);
	assert.deepEqual(items.map(item => [item.top, item.height, item.column, item.columns]), [[0, 120, 0, 2], [60, 120, 1, 2], [180, 60, 0, 1]]);
});

void test('a new day never inherits the prior day; opening an empty day does not create a note', async () => {
	const { repository, vault } = fixture();
	assert.deepEqual(await repository.load(date), emptyPlan(date));
	assert.equal(vault.writes, 0);
	await repository.save(emptyPlan(date), populated());
	assert.deepEqual(await repository.load('2026-11-11'), emptyPlan('2026-11-11'));
	assert.match(vault.contents.get('day-canvas/2026-11-10.md')!, /^---\nday_canvas: true/);
});

void test('routine imports persist once, new routines appear and deletion survives reopen', async () => {
	const { repository, vault } = fixture();
	await vault.create('routines/weekly-routine.md', '## Tuesday\n- [ ] 07:00 Sport\n- [ ] Laundry\n');
	const initial = await repository.load(date);
	assert.equal(initial.blocks.length, 1);
	const deleted = clone(initial); deleted.backlog = [];
	await repository.save(initial, deleted);
	const writes = vault.writes;
	assert.equal((await repository.load(date)).backlog.length, 0);
	assert.equal(vault.writes, writes);
	vault.contents.set('routines/weekly-routine.md', '## Tuesday\n- [ ] 07:00 Sport\n- [ ] Laundry\n- [ ] New routine\n');
	assert.deepEqual((await repository.load(date)).backlog.map(task => task.title), ['New routine']);
});

void test('daily note sync uses atomic process and preserves edits arriving just before write', async () => {
	const { repository, vault } = fixture({ storageMode: 'daily', dailyNotesFolder: 'Journal/Daily' });
	const path = repository.pathFor(date);
	await vault.create(path, writePlan('# My daily note\n\n## Journal\nOriginal journal\n', populated()));
	const base = await repository.load(date);
	const next = clone(base); next.blocks[0].startTime = '07:45';
	vault.beforeProcess = () => {
		const latest = vault.contents.get(path)!;
		vault.contents.set(path, latest.replace('- [ ] 07:30', '- [x] 07:30').replace('Original journal', 'A journal edit made during save'));
	};
	const result = await repository.save(base, next);
	assert.equal(result.blocks[0].completed, true);
	assert.equal(result.blocks[0].startTime, '07:45');
	assert.ok(vault.contents.get(path)!.includes('A journal edit made during save'));
});

void test('concurrent views merge independent edits and write failures can be retried', async () => {
	const { repository, vault } = fixture();
	await repository.save(emptyPlan(date), populated());
	const base = await repository.load(date);
	const first = clone(base); first.blocks[0].completed = true;
	const second = clone(base); second.backlog[0].title = 'Laundry';
	await Promise.all([repository.save(base, first), repository.save(base, second)]);
	const loaded = await repository.load(date);
	assert.equal(loaded.blocks[0].completed, true);
	assert.equal(loaded.backlog[0].title, 'Laundry');
	const next = clone(loaded); next.blocks = [];
	vault.fail = true;
	await assert.rejects(repository.save(loaded, next), /Disk full/);
	vault.fail = false;
	assert.equal((await repository.save(loaded, next)).blocks.length, 0);
});

void test('storage paths stay inside the vault and pending saves retain their loaded location', async () => {
	assert.throws(() => vaultPath('../escape'), /relative vault path/);
	assert.throws(() => vaultPath('/absolute'), /relative vault path/);
	assert.throws(() => vaultPath('C:\\escape'), /relative vault path/);
	const { repository, settings, vault } = fixture();
	const loadedPath = repository.pathFor(date);
	settings.plansFolder = 'Other';
	await repository.save(emptyPlan(date), populated(), loadedPath);
	assert.ok(vault.contents.has(loadedPath));
	assert.ok(!vault.contents.has(repository.pathFor(date)));
	settings.routinesFilePath = repository.pathFor(date);
	await assert.rejects(repository.load(date), /different files/);
});

void test('one time remains a point in Markdown, including when completed or saved again', () => {
	const plan = readPlan('## Timeblocks\n- [ ] 07:00 Aufstehen\n- [x] 23:59 Last reminder\n- [ ] 08:00 - 08:30 Explicit range\n', date);
	assert.equal(plan.blocks.length, 3);
	assert.equal(plan.blocks[0].endTime, undefined);
	assert.equal(plan.blocks[1].endTime, undefined);
	assert.equal(plan.blocks[1].completed, true);
	assert.equal(plan.blocks[2].endTime, '08:30');
	const content = writePlan('', plan);
	assert.match(content, /- \[ \] 07:00 Aufstehen <!--/);
	assert.doesNotMatch(content, /undefined|07:00 -|23:59 -/);
	assert.deepEqual(readPlan(content, date), plan);
	assert.equal(parseTask('- [ ] 24:00 Invalid start', 'invalid'), null);
	assert.equal(parseTask('- [ ] 07:00 - 25:00 Invalid end', 'invalid'), null);
});

void test('point labels remain visible next to ranges and simultaneous points without duration', () => {
	const point = { id: 'point', title: 'Reminder', completed: false, color: 'blue' as const, startTime: '07:00' };
	const another = { ...point, id: 'another' };
	const blocks = [point, another, block('range', '07:00', '08:00')];
	const items = layoutBlocks(blocks, 7 * 60, 9 * 60, 2);
	assert.equal(items.length, 3);
	assert.equal(new Set(items.map(item => item.column)).size, 3);
	assert.equal(items.find(item => item.block.id === 'point')!.height, 32);
	assert.equal(items.find(item => item.block.id === 'range')!.height, 120);
	assert.ok(!('endTime' in point));
	assert.equal(isVisible({ ...point, startTime: '06:59' }, 7 * 60, 9 * 60), false);
	assert.equal(isVisible(point, 7 * 60, 9 * 60), true);
	assert.equal(isVisible({ ...point, startTime: '09:00' }, 7 * 60, 9 * 60), false);
});

void test('moving a point and editing its start never introduces an end', () => {
	const plan = readPlan('## Timeblocks\n- [ ] 07:00 Reminder\n', date);
	const point = plan.blocks[0];
	moveBlock(point, 8 * 60);
	assert.equal(point.startTime, '08:00');
	assert.equal(point.endTime, undefined);
	assert.equal(setBlockTime(point, 'startTime', '09:15'), true);
	assert.equal(point.endTime, undefined);
	assert.equal(setBlockTime(point, 'startTime', ''), false);
	assert.equal(setBlockTime(point, 'startTime', '24:00'), false);
	assert.equal(setBlockTime(point, 'endTime', '09:00'), false);
	assert.equal(setBlockTime(point, 'endTime', '09:45'), true);
	moveBlock(point, 10 * 60);
	assert.equal(point.endTime, '10:30');
	assert.equal(setBlockTime(point, 'endTime', ' '), true);
	assert.ok(!('endTime' in point));
	assert.equal(firstFreeTime(plan.blocks, 10 * 60, 11 * 60), 10 * 60);
	assert.equal(firstFreeTime([...plan.blocks, block('occupied', '10:00', '10:45')], 10 * 60, 11 * 60), 10 * 60 + 45);
	assert.equal(firstFreeTime([block('full', '10:00', '11:00')], 10 * 60, 11 * 60), null);
});

void test('clearing the end survives live merge and a remote completion edit', () => {
	const base = populated();
	const local = clone(base);
	delete local.blocks[0].endTime;
	const remote = clone(base); remote.blocks[0].completed = true;
	const merged = mergeChanges(base, local, remote);
	assert.ok(!('endTime' in merged.blocks[0]));
	assert.equal(merged.blocks[0].completed, true);
	assert.equal(readPlan(writePlan('', merged), date).blocks[0].endTime, undefined);
});

void test('legacy point migration preserves explicit ranges and edited daily copies', () => {
	const routines = readRoutines('## Tuesday\n- [ ] 07:00 Aufstehen\n- [ ] 07:00 - 08:00 Sport\n- [ ] 08:00 Study English\n- [ ] 09:00 Reminder\n', date, JSON.parse);
	const plan = emptyPlan(date);
	importRoutines(plan, routines);
	plan.blocks[0].endTime = '07:30'; plan.blocks[0].completed = true;
	plan.blocks[2].endTime = '08:45'; // A duration explicitly changed by the user.
	plan.blocks[3].endTime = '09:30'; plan.blocks[3].startTime = '09:15'; // A moved copy.
	plan.blocks.push(block('manual', '07:00', '07:30'));
	migrateRoutinePoints(plan, routines, 30);
	assert.equal(plan.blocks[0].endTime, undefined);
	assert.equal(plan.blocks[0].completed, true);
	assert.equal(plan.blocks[1].endTime, '08:00');
	assert.equal(plan.blocks[2].endTime, '08:45');
	assert.equal(plan.blocks[3].endTime, '09:30');
	assert.equal(plan.blocks[4].endTime, '07:30');
});

void test('legacy stored routines lose their inferred duration exactly once on load', async () => {
	const { repository, vault } = fixture();
	const source = '## Tuesday\n- [ ] 07:00 Aufstehen\n- [ ] 07:00 - 08:00 Sport\n';
	await vault.create('routines/weekly-routine.md', source);
	const original = emptyPlan(date);
	importRoutines(original, readRoutines(source, date, JSON.parse));
	original.blocks[0].endTime = '07:30';
	const legacy = writePlan('# Journal\nPreserve me.\n', original).replace('"version":2', '"version":1');
	assert.equal(needsPointMigration(legacy), true);
	await vault.create(repository.pathFor(date), legacy);
	const upgraded = await repository.load(date);
	assert.equal(upgraded.blocks[0].endTime, undefined);
	assert.equal(upgraded.blocks[1].endTime, '08:00');
	assert.equal(needsPointMigration(vault.contents.get(repository.pathFor(date))!), false);
	assert.ok(vault.contents.get(repository.pathFor(date))!.includes('Preserve me.'));
	const writes = vault.writes;
	await repository.load(date);
	assert.equal(vault.writes, writes);
	const edited = clone(upgraded); edited.blocks[0].endTime = '07:30';
	await repository.save(upgraded, edited);
	assert.equal((await repository.load(date)).blocks[0].endTime, '07:30');
});

void test('dropping Sport over Aufstehen at 07:00 keeps both entries and the workout duration', async () => {
	const { repository } = fixture();
	const original = readPlan('## Timeblocks\n- [ ] 07:00 Aufstehen\n- [ ] 07:30 - 08:30 Sport\n', date);
	await repository.save(emptyPlan(date), original);
	const base = await repository.load(date);
	const next = clone(base);
	const scale = 2.4;
	// The pointer is on Aufstehen's label; its child element must not affect time mapping.
	const gridTop = -120; // The schedule has been scrolled.
	const pointerY = gridTop + (7 * 60 - 6 * 60) * scale + 12;
	const at = dropTimeAtPointer(pointerY, gridTop, 6 * 60, 23 * 60, scale);
	assert.equal(at, 7 * 60);
	moveBlock(next.blocks.find(item => item.title === 'Sport')!, at);
	await repository.save(base, next);
	const loaded = await repository.load(date);
	const sport = loaded.blocks.find(item => item.title === 'Sport')!;
	const aufstehen = loaded.blocks.find(item => item.title === 'Aufstehen')!;
	assert.equal(sport.startTime, '07:00');
	assert.equal(sport.endTime, '08:00');
	assert.equal(aufstehen.startTime, '07:00');
	assert.equal(aufstehen.endTime, undefined);
	const positions = layoutBlocks(loaded.blocks, 6 * 60, 23 * 60, scale);
	assert.equal(positions.length, 2);
	assert.notEqual(positions[0].column, positions[1].column);
});

void test('drop preview and final time snap to quarter hours across the whole scrolled grid', () => {
	const start = 6 * 60;
	const end = 23 * 60;
	const scale = 2.4;
	const top = -200;
	assert.equal(dropTimeAtPointer(top + 60 * scale, top, start, end, scale), 7 * 60);
	assert.equal(dropTimeAtPointer(top + 59 * scale, top, start, end, scale), 7 * 60);
	assert.equal(dropTimeAtPointer(top + 68 * scale, top, start, end, scale), 7 * 60 + 15);
	assert.equal(dropTimeAtPointer(top - 10, top, start, end, scale), start);
	assert.equal(dropTimeAtPointer(top + 2000 * scale, top, start, end, scale), end - 15);
});


void test('integrated board Markdown imports timed, point and untimed routines from its configured note', async () => {
	const { buildMarkdownFromCards } = await import('../src/markdownStore');
	const { repository, vault } = fixture({ routinesFilePath: 'custom/routines.md' });
	const cards = [
		{ id: 'wake', title: 'Wake up', notes: '', category: '', days: [1] as const, isTimed: true, startTime: '07:00', endTime: '', color: 'blue' as const, order: 0 },
		{ id: 'gym', title: 'Gym', notes: '', category: '', days: [1] as const, isTimed: true, startTime: '18:00', endTime: '19:00', color: 'green' as const, order: 1 },
		{ id: 'chores', title: 'Laundry', notes: '', category: '', days: [1] as const, isTimed: false, startTime: '', endTime: '', color: 'purple' as const, order: 2 },
	];
	const markdown = buildMarkdownFromCards(cards.map(card => ({ ...card, days: [...card.days] })));
	await vault.create('custom/routines.md', markdown);
	const plan = await repository.load(date);
	assert.equal(plan.blocks.length, 2);
	assert.equal(plan.blocks[0].endTime, undefined);
	assert.equal(plan.blocks[1].endTime, '19:00');
	assert.equal(plan.backlog[0].title, 'Laundry');
	const base = clone(plan);
	plan.blocks[0].completed = true;
	plan.blocks[1].startTime = '18:30';
	plan.backlog = [];
	await repository.save(base, plan);
	assert.equal(vault.contents.get('custom/routines.md'), markdown);
	const reopened = await repository.load(date);
	assert.equal(reopened.blocks[0].completed, true);
	assert.equal(reopened.blocks[1].startTime, '18:30');
	assert.equal(reopened.backlog.length, 0);
	const nextTuesday = await repository.load('2026-11-17');
	assert.equal(nextTuesday.blocks[0].completed, false);
	assert.equal(nextTuesday.blocks[1].startTime, '18:00');
	assert.equal(nextTuesday.backlog.length, 1);
});

void test('standalone day canvas settings preserve storage paths and validate malformed values', async () => {
	const { normalizeDayCanvasSettings } = await import('../src/dayCanvas/settings');
	const settings = normalizeDayCanvasSettings({ startHour: 23, endHour: 4, defaultDuration: -1, plansFolder: '../outside', storageMode: 'daily', dailyNotesFolder: 'Journal/Daily', routinesFilePath: 'old-routines.md' });
	assert.equal(settings.endHour, 24);
	assert.equal(settings.defaultDuration, 30);
	assert.equal(settings.plansFolder, 'day-canvas');
	assert.equal(settings.dailyNotesFolder, 'Journal/Daily');
	assert.equal(settings.storageMode, 'daily');
	assert.ok(!('routinesFilePath' in settings));
	assert.equal(normalizeDayCanvasSettings(null).startHour, 6);
});
