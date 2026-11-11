import { DEFAULT_SETTINGS, type DayCanvasSettings } from "./types";
import { vaultPath } from "./repository";

export type DayPlannerSettings = Omit<DayCanvasSettings, "routinesFilePath">;

/** Validate both nested board settings and settings adopted from standalone Day Canvas. */
export function normalizeDayCanvasSettings(value: unknown): DayPlannerSettings {
	const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
	const integer = (key: string, min: number, max: number, fallback: number): number => {
		const candidate = raw[key];
		return typeof candidate === "number" && Number.isInteger(candidate) && candidate >= min && candidate <= max ? candidate : fallback;
	};
	const folder = (key: "plansFolder" | "dailyNotesFolder"): string => {
		const candidate = raw[key];
		try { return typeof candidate === "string" ? vaultPath(candidate) : DEFAULT_SETTINGS[key]; }
		catch { return DEFAULT_SETTINGS[key]; }
	};
	const startHour = integer("startHour", 0, 23, DEFAULT_SETTINGS.startHour);
	return {
		startHour,
		endHour: integer("endHour", startHour + 1, 24, Math.max(DEFAULT_SETTINGS.endHour, startHour + 1)),
		defaultDuration: integer("defaultDuration", 5, 240, DEFAULT_SETTINGS.defaultDuration),
		storageMode: raw.storageMode === "daily" ? "daily" : "dedicated",
		plansFolder: folder("plansFolder"),
		dailyNotesFolder: folder("dailyNotesFolder"),
	};
}
