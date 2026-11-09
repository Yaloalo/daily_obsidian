import { App, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type WeeklyRoutinePlannerPlugin from "../main";
import type { WeeklyPlannerSettings } from "./types";

type ToggleKey = Exclude<keyof WeeklyPlannerSettings, "cards">;

interface ToggleSettingSpec {
	key: ToggleKey;
	name: string;
	desc: string;
}

const TOGGLE_SETTINGS: ToggleSettingSpec[] = [
	{
		key: "startWeekOnSunday",
		name: "Start week on Sunday",
		desc: "Display Sunday as the first column instead of Monday.",
	},
	{
		key: "use24HourFormat",
		name: "Use 24-hour time format",
		desc: "Display times as 14:00 instead of 2:00 PM on timed cards.",
	},
	{
		key: "showWeekends",
		name: "Show weekend columns",
		desc: "Include Saturday and Sunday on the weekly board.",
	},
	{
		key: "highlightToday",
		name: "Highlight current day",
		desc: "Emphasize the column corresponding to the current day of the week.",
	},
	{
		key: "compactCards",
		name: "Compact card display",
		desc: "Hide card notes on the board so more cards fit in each day column.",
	},
];

function isToggleKey(key: string): key is ToggleKey {
	return TOGGLE_SETTINGS.some((spec) => spec.key === key);
}

export class WeeklyPlannerSettingTab extends PluginSettingTab {
	plugin: WeeklyRoutinePlannerPlugin;

	constructor(app: App, plugin: WeeklyRoutinePlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Declarative settings (Obsidian 1.13.0+). Makes every option searchable
	 * from Obsidian's global settings search.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		return TOGGLE_SETTINGS.map((spec) => ({
			name: spec.name,
			desc: spec.desc,
			control: {
				type: "toggle",
				key: spec.key,
			},
		}));
	}

	getControlValue(key: string): unknown {
		if (isToggleKey(key)) {
			return this.plugin.settings[key];
		}
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (isToggleKey(key) && typeof value === "boolean") {
			this.plugin.settings[key] = value;
			await this.plugin.saveSettings();
			this.plugin.refreshViews();
		}
	}

	/**
	 * Imperative fallback for Obsidian versions older than 1.13.0.
	 * Newer versions render from getSettingDefinitions() instead.
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const spec of TOGGLE_SETTINGS) {
			new Setting(containerEl)
				.setName(spec.name)
				.setDesc(spec.desc)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings[spec.key])
						.onChange(async (value) => {
							await this.setControlValue(spec.key, value);
						})
				);
		}
	}
}
