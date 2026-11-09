export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CardColor =
	| "default"
	| "blue"
	| "green"
	| "amber"
	| "red"
	| "purple"
	| "teal";

export interface RoutineCard {
	id: string;
	title: string;
	notes: string;
	category: string;
	days: DayIndex[];
	isTimed: boolean;
	startTime: string;
	endTime: string;
	color: CardColor;
	order: number;
}

export interface WeeklyPlannerSettings {
	cards: RoutineCard[];
	startWeekOnSunday: boolean;
	use24HourFormat: boolean;
	showWeekends: boolean;
	highlightToday: boolean;
	compactCards: boolean;
}

export interface DayMetadata {
	index: DayIndex;
	shortName: string;
	fullName: string;
}

export const DAYS_MONDAY_FIRST: DayMetadata[] = [
	{ index: 0, shortName: "Mon", fullName: "Monday" },
	{ index: 1, shortName: "Tue", fullName: "Tuesday" },
	{ index: 2, shortName: "Wed", fullName: "Wednesday" },
	{ index: 3, shortName: "Thu", fullName: "Thursday" },
	{ index: 4, shortName: "Fri", fullName: "Friday" },
	{ index: 5, shortName: "Sat", fullName: "Saturday" },
	{ index: 6, shortName: "Sun", fullName: "Sunday" },
];

export const CARD_COLORS: { value: CardColor; label: string }[] = [
	{ value: "default", label: "Default" },
	{ value: "blue", label: "Blue" },
	{ value: "green", label: "Green" },
	{ value: "amber", label: "Amber" },
	{ value: "red", label: "Red" },
	{ value: "purple", label: "Purple" },
	{ value: "teal", label: "Teal" },
];

export const DEFAULT_SETTINGS: WeeklyPlannerSettings = {
	cards: [],
	startWeekOnSunday: false,
	use24HourFormat: true,
	showWeekends: true,
	highlightToday: true,
	compactCards: false,
};

export function getOrderedDays(
	startWeekOnSunday: boolean,
	showWeekends: boolean
): DayMetadata[] {
	let days = [...DAYS_MONDAY_FIRST];
	if (startWeekOnSunday) {
		const sunday = days[6];
		days = [sunday, ...days.slice(0, 6)];
	}
	if (!showWeekends) {
		days = days.filter((d) => d.index !== 5 && d.index !== 6);
	}
	return days;
}

export function getCurrentDayIndex(): DayIndex {
	// JS Date.getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
	const jsDay = new Date().getDay();
	return ((jsDay + 6) % 7) as DayIndex;
}

export function formatTimeDisplay(timeStr: string, use24Hour: boolean): string {
	if (!timeStr || !timeStr.includes(":")) {
		return timeStr;
	}
	const parts = timeStr.split(":");
	const hours = parseInt(parts[0], 10);
	const minutes = parts[1] ?? "00";
	if (isNaN(hours)) {
		return timeStr;
	}
	if (use24Hour) {
		return `${String(hours).padStart(2, "0")}:${minutes}`;
	}
	const period = hours >= 12 ? "PM" : "AM";
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;
	return `${hour12}:${minutes} ${period}`;
}

/**
 * Parses flexible user-typed time strings such as:
 * "7" -> "07:00"
 * "07:30" / "7:30" / "7.30" / "7,30" -> "07:30"
 * "730" -> "07:30"
 * "1800" -> "18:00"
 * "7pm" / "7:30 pm" -> "19:00" / "19:30"
 */
export function parseFlexibleTime(raw: string): string | null {
	const cleaned = raw.trim().toLowerCase();
	if (!cleaned) {
		return null;
	}

	let isPm = false;
	let isAm = false;
	let working = cleaned;

	if (working.endsWith("pm")) {
		isPm = true;
		working = working.slice(0, -2).trim();
	} else if (working.endsWith("am")) {
		isAm = true;
		working = working.slice(0, -2).trim();
	}

	let hours = NaN;
	let minutes = 0;

	if (/^\d{1,2}[:.,]\d{1,2}$/.test(working)) {
		const parts = working.split(/[:.,]/);
		hours = parseInt(parts[0], 10);
		minutes = parseInt(parts[1].padEnd(2, "0").slice(0, 2), 10);
	} else if (/^\d{1,2}$/.test(working)) {
		hours = parseInt(working, 10);
		minutes = 0;
	} else if (/^\d{3}$/.test(working)) {
		hours = parseInt(working.slice(0, 1), 10);
		minutes = parseInt(working.slice(1), 10);
	} else if (/^\d{4}$/.test(working)) {
		hours = parseInt(working.slice(0, 2), 10);
		minutes = parseInt(working.slice(2), 10);
	} else {
		return null;
	}

	if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) {
		return null;
	}

	if (isPm && hours < 12) {
		hours += 12;
	} else if (isAm && hours === 12) {
		hours = 0;
	}

	if (hours < 0 || hours > 23) {
		return null;
	}

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function generateCardId(): string {
	return `card-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}
