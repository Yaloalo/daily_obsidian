import { color, emptyPlan, type BacklogTask, type DayPlan, type TimeBlock } from './types';
import { minutes, stableId, timeString, validSchedule } from './time';

const metadataPattern = /\s*<!-- dc:(\{[^<>]*\}) -->\s*$/;
const statePattern = /^<!-- day-canvas:(\{.*\}) -->\s*$/;

/** Ignore headings and task lists inside frontmatter and fenced code. */
export function markdownLines(content: string): { text: string; active: boolean }[] {
	let fence = '';
	let frontmatter = false;
	return content.replace(/\r\n/g, '\n').split('\n').map((text, index) => {
		if (index === 0 && text === '---') { frontmatter = true; return { text, active: false }; }
		if (frontmatter) { if (/^(---|\.\.\.)\s*$/.test(text)) frontmatter = false; return { text, active: false }; }
		const marker = text.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (marker) {
			if (!fence) fence = marker[1];
			else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && /^\s{0,3}(`+|~+)\s*$/.test(text)) fence = '';
			return { text, active: false };
		}
		return { text, active: !fence };
	});
}

export function sectionBounds(content: string): { start: number; end: number } | null {
	const lines = markdownLines(content);
	const start = lines.findIndex(line => line.active && /^##\s+Timeblocks\s*#*\s*$/i.test(line.text));
	if (start < 0) return null;
	let end = start + 1;
	while (end < lines.length && !(lines[end].active && /^#{1,2}\s/.test(lines[end].text))) end++;
	return { start, end };
}

/** Shared with the weekly Markdown reader. Invalid time ranges remain untouched in the note. */
export function parseTask(line: string, fallbackId: string): BacklogTask | TimeBlock | null {
	const match = line.match(/^\s*[-*+] \[([ xX])\]\s+(.+?)\s*$/);
	if (!match) return null;
	let title = match[2];
	let meta: Record<string, unknown> = {};
	const encoded = title.match(metadataPattern);
	if (encoded) {
		try {
			const parsed: unknown = JSON.parse(encoded[1]);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
			meta = parsed as Record<string, unknown>;
		} catch { return null; }
		title = title.replace(metadataPattern, '');
	}
	const task: BacklogTask = {
		id: typeof meta.id === 'string' && meta.id ? meta.id : fallbackId,
		title, completed: match[1].toLowerCase() === 'x', color: color(meta.color),
		...(typeof meta.routineId === 'string' ? { routineId: meta.routineId } : {})
	};
	if (meta.kind === 'task') return title.trim() || typeof meta.id === 'string' ? task : null;
	const timed = title.match(/^(\d{1,2}:\d{2})(?:\s*[-–—]\s*(\d{1,2}:\d{2}))?(?:\s+(.+))?$/);
	if (!timed) {
		if (/^\d{1,2}:\d{2}(?:\s|$)/.test(title)) return null;
		return title.trim() ? task : null;
	}
	const startTime = timeString(minutes(timed[1]));
	const endTime = timed[2] ? timeString(minutes(timed[2])) : undefined;
	if (!validSchedule(startTime, endTime) || (!timed[3] && meta.kind !== 'block')) return null;
	return { ...task, title: timed[3] ?? '', startTime, ...(endTime ? { endTime } : {}) };
}

/** Version 1 filled in a duration even when a routine supplied only one time. */
export function needsPointMigration(content: string): boolean {
	const bounds = sectionBounds(content);
	if (!bounds) return false;
	return markdownLines(content).slice(bounds.start + 1, bounds.end).some(line => {
		const state = line.active && line.text.match(statePattern);
		if (!state) return false;
		try {
			const parsed = JSON.parse(state[1]) as { version?: unknown } | null;
			return parsed?.version === 1;
		} catch { return false; }
	});
}

function sectionTasks(content: string): Map<number, BacklogTask | TimeBlock> {
	const bounds = sectionBounds(content);
	const result = new Map<number, BacklogTask | TimeBlock>();
	if (!bounds) return result;
	const lines = markdownLines(content);
	const seen = new Map<string, number>();
	const ids = new Set<string>();
	for (let i = bounds.start + 1; i < bounds.end; i++) {
		if (!lines[i].active) continue;
		// A plain task keeps its identity when only the checkbox or times change.
		const key = lines[i].text.replace(/^\s*[-*+] \[[ xX]\]\s*/, '').replace(/^\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\s+/, '').replace(metadataPattern, '');
		const occurrence = seen.get(key) ?? 0;
		seen.set(key, occurrence + 1);
		const task = parseTask(lines[i].text, `md-${stableId(key)}-${occurrence}`);
		if (task) {
			if (ids.has(task.id)) task.id = `${task.id}-${i}`;
			ids.add(task.id);
			result.set(i, task);
		}
	}
	return result;
}

export function readPlan(content: string, date: string): DayPlan {
	const plan = emptyPlan(date);
	for (const task of sectionTasks(content).values()) {
		if ('startTime' in task) plan.blocks.push(task); else plan.backlog.push(task);
	}
	const bounds = sectionBounds(content);
	if (bounds) {
		for (const line of markdownLines(content).slice(bounds.start + 1, bounds.end)) {
			const state = line.active && line.text.match(statePattern);
			if (!state) continue;
			try {
				const parsed = JSON.parse(state[1]) as { routineIds?: unknown } | null;
				if (Array.isArray(parsed?.routineIds)) plan.routineIds = parsed.routineIds.filter((id: unknown): id is string => typeof id === 'string');
			} catch { /* A malformed state comment must not hide readable tasks. */ }
		}
	}
	return plan;
}

function safeJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function taskLine(task: BacklogTask | TimeBlock): string {
	const time = 'startTime' in task ? `${task.startTime}${task.endTime ? ` - ${task.endTime}` : ''} ` : '';
	const meta = safeJson({ id: task.id, kind: 'startTime' in task ? 'block' : 'task', color: task.color, ...(task.routineId ? { routineId: task.routineId } : {}) });
	return `- [${task.completed ? 'x' : ' '}] ${time}${task.title.replace(/[\r\n]+/g, ' ').trim()} <!-- dc:${meta} -->`;
}

/** Replaces only recognized task lines and our state comment; other note text survives. */
export function writePlan(content: string, plan: DayPlan): string {
	const eol = content.includes('\r\n') ? '\r\n' : '\n';
	const lines = content.replace(/\r\n/g, '\n').split('\n');
	const bounds = sectionBounds(content);
	const tasks = new Map([...plan.blocks, ...plan.backlog].map(task => [task.id, task]));
	const state = `<!-- day-canvas:${safeJson({ version: 2, routineIds: plan.routineIds })} -->`;
	if (!bounds) {
		const prefix = content.trimEnd();
		return `${prefix ? prefix + eol + eol : ''}## Timeblocks${eol}${state}${eol}${[...tasks.values()].map(taskLine).join(eol)}${eol}`;
	}
	const originalTasks = sectionTasks(content);
	const active = markdownLines(content);
	const body: string[] = [state];
	for (let i = bounds.start + 1; i < bounds.end; i++) {
		if (active[i].active && statePattern.test(lines[i])) continue;
		const original = originalTasks.get(i);
		if (!original) { body.push(lines[i]); continue; }
		const task = tasks.get(original.id);
		if (task) { body.push(taskLine(task)); tasks.delete(original.id); }
	}
	while (body[body.length - 1] === '') body.pop();
	body.push(...[...tasks.values()].map(taskLine), '');
	return [...lines.slice(0, bounds.start + 1), ...body, ...lines.slice(bounds.end)].join(eol);
}

/** Apply only fields the canvas actually changed to the latest note contents. */
export function mergeChanges(base: DayPlan, next: DayPlan, remote: DayPlan): DayPlan {
	const before = new Map<string, BacklogTask | TimeBlock>([...base.blocks, ...base.backlog].map(task => [task.id, task]));
	const after = new Map<string, BacklogTask | TimeBlock>([...next.blocks, ...next.backlog].map(task => [task.id, task]));
	const merged = new Map([...remote.blocks, ...remote.backlog].map(task => [task.id, { ...task }]));
	for (const id of before.keys()) if (!after.has(id)) merged.delete(id);
	for (const [id, task] of after) {
		const old = before.get(id);
		if (!old) { merged.set(id, { ...task }); continue; }
		const existing = merged.get(id);
		// An external deletion takes precedence over a stale canvas edit.
		if (!existing) continue;
		const changes: Record<string, unknown> = {};
		for (const field of new Set([...Object.keys(old), ...Object.keys(task)])) {
			const key = field as keyof typeof task;
			if (old[key] !== task[key]) changes[field] = task[key];
		}
		const updated = { ...existing, ...changes } as BacklogTask | TimeBlock;
		if ('startTime' in old && !('startTime' in task)) {
			delete (updated as Partial<TimeBlock>).startTime;
			delete (updated as Partial<TimeBlock>).endTime;
		}
		if ('startTime' in updated && 'startTime' in task && !validSchedule(updated.startTime, updated.endTime)) {
			updated.startTime = task.startTime;
			updated.endTime = task.endTime;
		}
		if ('endTime' in updated && !updated.endTime) delete updated.endTime;
		merged.set(id, updated);
	}
	const result = emptyPlan(next.date);
	for (const task of merged.values()) {
		if ('startTime' in task) result.blocks.push(task as TimeBlock); else result.backlog.push(task);
	}
	result.routineIds = [...new Set([...remote.routineIds, ...next.routineIds])];
	return result;
}
