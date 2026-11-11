import { markdownLines, parseTask } from './markdown';
import { color, type BacklogTask, type DayPlan, type TimeBlock } from './types';
import { minutes, stableId, timeString, validRange } from './time';

type YamlReader = (source: string) => unknown;
const weekdays = [
	['monday', 'mon', 'montag', 'mo'], ['tuesday', 'tue', 'dienstag', 'di'],
	['wednesday', 'wed', 'mittwoch', 'mi'], ['thursday', 'thu', 'donnerstag', 'do'],
	['friday', 'fri', 'freitag', 'fr'], ['saturday', 'sat', 'samstag', 'sa'],
	['sunday', 'sun', 'sonntag', 'so']
];

export function readRoutines(content: string, date: string, parseYaml: YamlReader): (BacklogTask | TimeBlock)[] {
	const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
	const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (frontmatter) {
		// Weekly Routine Board uses Monday = 0 and stores authoritative cards in YAML.
		const data = parseYaml(frontmatter[1]) as { cards?: unknown } | null;
		if (data && Array.isArray(data.cards)) {
			return data.cards.flatMap((value: unknown, index: number) => {
				if (!value || typeof value !== 'object') return [];
				const card = value as Record<string, unknown>;
				if (typeof card.title !== 'string' || !card.title.trim() || !Array.isArray(card.days) || !card.days.map(Number).includes(weekday)) return [];
				const routineId = `board-${typeof card.id === 'string' ? card.id : stableId(`${card.title}-${index}`)}`;
				const task: BacklogTask = { id: `routine-${stableId(routineId)}`, routineId, title: card.title, completed: false, color: color(card.color) };
				if (card.isTimed && typeof card.startTime === 'string' && Number.isFinite(minutes(card.startTime)) && minutes(card.startTime) < 1440) {
					const startTime = timeString(minutes(card.startTime));
					const endTime = typeof card.endTime === 'string' && validRange(startTime, card.endTime) ? timeString(minutes(card.endTime)) : undefined;
					return [{ ...task, startTime, ...(endTime ? { endTime } : {}) }];
				}
				return [task];
			});
		}
	}
	// Plain Markdown also works; a day heading owns its subsections until the next peer heading.
	let inDay = false;
	let dayLevel = 0;
	const tasks: (BacklogTask | TimeBlock)[] = [];
	const occurrences = new Map<string, number>();
	for (const line of markdownLines(content)) {
		if (!line.active) continue;
		const heading = line.text.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
		if (heading) {
			const name = heading[2].trim().toLowerCase().replace(/\.$/, '');
			const isDay = weekdays.some(names => names.includes(name));
			if (isDay || (inDay && heading[1].length <= dayLevel)) {
				inDay = weekdays[weekday].includes(name);
				dayLevel = heading[1].length;
			}
			continue;
		}
		if (!inDay) continue;
		const parsed = parseTask(line.text.replace(/^(\s*[-*+] )(?!\[[ xX]\] )/, '$1[ ] '), 'routine');
		if (!parsed) continue;
		const signature = `${weekday}:${parsed.title}:${'startTime' in parsed ? parsed.startTime : ''}`;
		const count = occurrences.get(signature) ?? 0;
		occurrences.set(signature, count + 1);
		const routineId = `markdown-${stableId(signature)}-${count}`;
		tasks.push({ ...parsed, id: `routine-${stableId(routineId)}`, routineId, completed: false });
	}
	return tasks;
}

/** Repair only unchanged copies of routines whose old end was generated automatically. */
export function migrateRoutinePoints(plan: DayPlan, routines: (BacklogTask | TimeBlock)[], previousDuration: number): void {
	for (const block of plan.blocks) {
		if (!block.routineId || !block.endTime) continue;
		const source = routines.find(task => task.routineId === block.routineId);
		if (!source || !('startTime' in source) || source.endTime) continue;
		if (block.title === source.title && block.startTime === source.startTime && block.endTime === timeString(minutes(block.startTime) + previousDuration)) {
			delete block.endTime;
		}
	}
}

export function importRoutines(plan: DayPlan, routines: (BacklogTask | TimeBlock)[]): boolean {
	let changed = false;
	for (const task of routines) {
		if (!task.routineId || plan.routineIds.includes(task.routineId)) continue;
		plan.routineIds.push(task.routineId);
		changed = true;
		const duplicate = [...plan.blocks, ...plan.backlog].find(existing =>
			existing.title === task.title && ('startTime' in existing ? existing.startTime : '') === ('startTime' in task ? task.startTime : '')
		);
		if (duplicate) duplicate.routineId = task.routineId;
		else if ('startTime' in task) plan.blocks.push({ ...task }); else plan.backlog.push({ ...task });
	}
	return changed;
}
