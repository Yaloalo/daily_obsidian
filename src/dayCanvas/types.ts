export const COLORS = ['blue', 'green', 'amber', 'red', 'purple', 'teal'] as const;
export type BlockColor = typeof COLORS[number];

export interface BacklogTask {
	id: string;
	title: string;
	completed: boolean;
	color: BlockColor;
	routineId?: string;
}

export interface TimeBlock extends BacklogTask {
	startTime: string;
	/** Absent for an entry at a single time, which reserves no time interval. */
	endTime?: string;
}

export interface DayPlan {
	date: string;
	blocks: TimeBlock[];
	backlog: BacklogTask[];
	/** Includes removed routines so they do not reappear on the next load. */
	routineIds: string[];
}

export interface DayCanvasSettings {
	startHour: number;
	endHour: number;
	routinesFilePath: string;
	storageMode: 'dedicated' | 'daily';
	plansFolder: string;
	dailyNotesFolder: string;
	defaultDuration: number;
}

export const DEFAULT_SETTINGS: DayCanvasSettings = {
	startHour: 6,
	endHour: 23,
	routinesFilePath: 'routines/weekly-routine.md',
	storageMode: 'dedicated',
	plansFolder: 'day-canvas',
	dailyNotesFolder: '',
	defaultDuration: 30
};

export function emptyPlan(date: string): DayPlan {
	return { date, blocks: [], backlog: [], routineIds: [] };
}

export function color(value: unknown): BlockColor {
	return COLORS.includes(value as BlockColor) ? value as BlockColor : 'blue';
}
