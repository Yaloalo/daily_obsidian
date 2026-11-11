/** Dates are deliberately local: UTC conversion can select yesterday/tomorrow. */
export function dateKey(date = new Date()): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date: string, days: number): string {
	const local = new Date(`${date}T12:00:00`);
	local.setDate(local.getDate() + days);
	return dateKey(local);
}

export function minutes(time: string): number {
	if (!/^\d{1,2}:\d{2}$/.test(time)) return NaN;
	const [h, m] = time.split(':').map(Number);
	return h >= 0 && h <= 24 && m >= 0 && m < 60 && (h < 24 || m === 0) ? h * 60 + m : NaN;
}

export function timeString(value: number): string {
	const clamped = Math.max(0, Math.min(1440, Math.round(value)));
	return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function validRange(start: string, end: string): boolean {
	return Number.isFinite(minutes(start)) && Number.isFinite(minutes(end)) && minutes(start) < minutes(end);
}

export function validSchedule(start: string, end?: string): boolean {
	return Number.isFinite(minutes(start)) && minutes(start) < 1440 && (!end || validRange(start, end));
}

export function newId(): string {
	return crypto.randomUUID();
}

export function stableId(value: string): string {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
	return (hash >>> 0).toString(36);
}
