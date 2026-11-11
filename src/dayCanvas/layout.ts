import { minutes } from './time';
import type { TimeBlock } from './types';

export interface PositionedBlock {
	block: TimeBlock;
	top: number;
	height: number;
	column: number;
	columns: number;
}

export function isVisible(block: TimeBlock, start: number, end: number): boolean {
	const at = minutes(block.startTime);
	return at < end && (block.endTime ? minutes(block.endTime) > start : at >= start);
}

/** Assign overlapping intervals separate columns; touching intervals can reuse a column. */
export function layoutBlocks(blocks: TimeBlock[], start: number, end: number, pixelsPerMinute: number): PositionedBlock[] {
	const sorted = blocks.filter(block => isVisible(block, start, end))
		.slice().sort((a, b) => minutes(a.startTime) - minutes(b.startTime) || minutes(b.endTime ?? b.startTime) - minutes(a.endTime ?? a.startTime) || a.id.localeCompare(b.id));
	const result: PositionedBlock[] = [];
	let group: PositionedBlock[] = [];
	let columnEnds: number[] = [];
	let groupEnd = -1;
	function finishGroup() {
		for (const item of group) item.columns = columnEnds.length;
		group = [];
		columnEnds = [];
	}
	for (const block of sorted) {
		const blockStart = Math.max(start, minutes(block.startTime));
		// A point's fixed-height label needs screen space, but has no time duration.
		const height = block.endTime ? (Math.min(end, minutes(block.endTime)) - blockStart) * pixelsPerMinute : 32;
		const blockEnd = blockStart + height / pixelsPerMinute;
		if (blockStart >= groupEnd) finishGroup();
		let column = columnEnds.findIndex(value => value <= blockStart);
		if (column < 0) column = columnEnds.length;
		columnEnds[column] = blockEnd;
		const item = { block, top: (blockStart - start) * pixelsPerMinute, height, column, columns: 1 };
		result.push(item);
		group.push(item);
		groupEnd = Math.max(blockStart >= groupEnd ? -1 : groupEnd, blockEnd);
	}
	finishGroup();
	return result;
}
