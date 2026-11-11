import { normalizePath, parseYaml, TFile, TFolder, type App } from 'obsidian';
import { mergeChanges, needsPointMigration, readPlan, writePlan } from './markdown';
import { importRoutines, migrateRoutinePoints, readRoutines } from './routines';
import type { DayCanvasSettings, DayPlan } from './types';

export function vaultPath(path: string, allowEmpty = true): string {
	const trimmed = path.trim();
	if ((!allowEmpty && !trimmed) || /(^[/\\]|^[A-Za-z]:|[\r\n]|(^|[/\\])\.\.([/\\]|$))/.test(trimmed)) {
		throw new Error('Use a relative vault path without "..".');
	}
	return trimmed ? normalizePath(trimmed).replace(/\/$/, '') : '';
}

export class DayPlanRepository {
	private queues = new Map<string, Promise<unknown>>();
	private listeners = new Set<(path?: string) => void>();

	constructor(private app: App, private getSettings: () => DayCanvasSettings) {}

	get settings(): DayCanvasSettings { return this.getSettings(); }

	pathFor(date: string): string {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid plan date.');
		const settings = this.settings;
		const folder = vaultPath(settings.storageMode === 'daily' ? settings.dailyNotesFolder : settings.plansFolder);
		const path = normalizePath(`${folder ? folder + '/' : ''}${date}.md`);
		if (path === vaultPath(settings.routinesFilePath, false)) throw new Error('The plan and routines must use different files.');
		return path;
	}

	subscribe(listener: (path?: string) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	notify(path?: string): void { for (const listener of this.listeners) listener(path); }

	private serial<T>(path: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(path) ?? Promise.resolve();
		const current = previous.catch(() => {}).then(operation);
		this.queues.set(path, current);
		void current.finally(() => { if (this.queues.get(path) === current) this.queues.delete(path); }).catch(() => {});
		return current;
	}

	private async read(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) return this.app.vault.read(file);
		if (file) throw new Error(`A folder exists at ${path}. Choose another storage path.`);
		return '';
	}

	private async ensureFolder(path: string): Promise<void> {
		const parts = path.split('/').slice(0, -1);
		let folder = '';
		for (const part of parts) {
			folder = folder ? `${folder}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(folder);
			if (existing instanceof TFolder) continue;
			if (existing) throw new Error(`A file blocks the folder ${folder}.`);
			try { await this.app.vault.createFolder(folder); }
			catch (error) { if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) throw error; }
		}
	}

	private async update(path: string, date: string, transform: (content: string) => string): Promise<void> {
		let file = this.app.vault.getAbstractFileByPath(path);
		if (!file) {
			await this.ensureFolder(path);
			const initial = `---\nday_canvas: true\ndate: ${date}\n---\n\n# ${date}\n\n`;
			try { await this.app.vault.create(path, transform(initial)); return; }
			catch (error) {
				file = this.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) throw error;
			}
		}
		if (!(file instanceof TFile)) throw new Error(`Cannot write plan: ${path} is not a note.`);
		await this.app.vault.process(file, transform);
	}

	async load(date: string): Promise<DayPlan> {
		const path = this.pathFor(date);
		return this.serial(path, async () => {
			const content = await this.read(path);
			const plan = readPlan(content, date);
			const source = await this.read(vaultPath(this.settings.routinesFilePath, false));
			const routines = source ? readRoutines(source, date, parseYaml) : [];
			const migrate = routines.length > 0 && needsPointMigration(content);
			if (importRoutines(plan, routines) || migrate) {
				let result = plan;
				await this.update(path, date, latest => {
					result = readPlan(latest, date);
					if (needsPointMigration(latest)) migrateRoutinePoints(result, routines, this.settings.defaultDuration);
					importRoutines(result, routines);
					return writePlan(latest, result);
				});
				return result;
			}
			return plan;
		});
	}

	async save(base: DayPlan, next: DayPlan, path = this.pathFor(next.date)): Promise<DayPlan> {
		return this.serial(path, async () => {
			let result = next;
			await this.update(path, next.date, content => {
				result = mergeChanges(base, next, readPlan(content, next.date));
				return writePlan(content, result);
			});
			this.notify(path);
			return result;
		});
	}

	async ensureNote(date: string): Promise<TFile> {
		const path = this.pathFor(date);
		await this.serial(path, () => this.update(path, date, content => writePlan(content, readPlan(content, date))));
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error(`Unable to open ${path}.`);
		return file;
	}
}
