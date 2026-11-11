import type { TimeBlock } from './types';
import { minutes, timeString, validSchedule } from './time';

/** Resolve against the whole grid so cards under the pointer cannot block a drop. */
export function dropTimeAtPointer(clientY: number, gridTop: number, start: number, end: number, pixelsPerMinute: number): number {
	const step = 15;
	const offset = (clientY - gridTop) / pixelsPerMinute;
	const snapped = start + Math.round(offset / step) * step;
	return Math.max(start, Math.min(end - step, snapped));
}

/** Points occupy no interval. Only explicit ranges can block the suggested time. */
export function firstFreeTime(blocks: TimeBlock[], start: number, end: number): number | null {
	let at = start;
	for (const block of blocks.filter(block => block.endTime).slice().sort((a, b) => minutes(a.startTime) - minutes(b.startTime))) {
		if (minutes(block.endTime!) <= at) continue;
		if (minutes(block.startTime) > at) break;
		at = minutes(block.endTime!);
	}
	return at < end ? at : null;
}

export function moveBlock(block: TimeBlock, at: number): void {
	const duration = block.endTime ? minutes(block.endTime) - minutes(block.startTime) : undefined;
	block.startTime = timeString(at);
	if (duration !== undefined) block.endTime = timeString(Math.min(1440, at + duration));
}

/** A blank end time deliberately turns a ranged block into a point. */
export function setBlockTime(block: TimeBlock, key: 'startTime' | 'endTime', raw: string): boolean {
	const value = raw.trim();
	const start = key === 'startTime' ? value : block.startTime;
	const end = key === 'endTime' ? value : block.endTime;
	if (!validSchedule(start, end)) return false;
	if (key === 'endTime' && !value) delete block.endTime;
	else block[key] = timeString(minutes(value));
	return true;
}
