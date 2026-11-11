import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type WeeklyRoutinePlannerPlugin from "../main";
import type { WeeklyPlannerSettings } from "./types";
import { vaultPath } from "./dayCanvas/repository";
import type { DayPlannerSettings } from "./dayCanvas/settings";

type ToggleKey = Exclude<keyof WeeklyPlannerSettings, "cards" | "notePath" | "dayCanvas">;

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

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Routines markdown note",
				desc: "Shared source for the weekly board and day canvas. Apply a path to load its cards, or create a note with the current cards.",
				render: setting => this.routinePathSetting(setting),
			},
			...TOGGLE_SETTINGS.map((spec): SettingDefinitionItem => ({
				name: spec.name,
				desc: spec.desc,
				control: { type: "toggle", key: spec.key },
			})),
			...this.dayCanvasDefinitions(),
		];
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

	/** The same settings work before and after declarative settings support. */
	display(): void {
		this.containerEl.empty();
		for (const definition of this.getSettingDefinitions()) {
			if (!("name" in definition)) continue;
			const setting = new Setting(this.containerEl).setName(definition.name);
			if (definition.desc) setting.setDesc(definition.desc);
			if ("render" in definition && definition.render) {
				// Custom rows use the same renderer on older Obsidian versions.
				definition.render(setting, undefined as never);
			} else if ("control" in definition && definition.control?.type === "toggle") {
				const key = definition.control.key;
				setting.addToggle(toggle => toggle.setValue(Boolean(this.getControlValue(key))).onChange(value => this.setControlValue(key, value)));
			}
		}
	}

	private routinePathSetting(setting: Setting): void {
		let draft = this.plugin.settings.notePath;
		setting.addText(text => text.setValue(draft).onChange(value => { draft = value; }));
		setting.addButton(button => button.setButtonText("Apply").onClick(async () => {
			try {
				const path = vaultPath(draft, false);
				const cards = await this.plugin.repo.loadCards(path);
				if (cards === null && await this.plugin.repo.readFileSafe(path) !== null) {
					throw new Error("That note does not contain weekly routine cards. Choose a new path or a routine note.");
				}
				this.plugin.settings.notePath = path;
				if (cards !== null) this.plugin.settings.cards = cards;
				await this.plugin.saveSettings();
				this.plugin.refreshViews();
				button.setButtonText("Applied");
			} catch (error) { new Notice(String(error)); }
		}));
	}

	private dayCanvasDefinitions(): SettingDefinitionItem[] {
		const numbers: { key: "startHour" | "endHour" | "defaultDuration"; name: string; desc: string; validate: (value: number) => boolean }[] = [
			{ key: "startHour", name: "Day canvas start hour", desc: "First visible hour, from 0 to 23, before the end hour.", validate: value => value >= 0 && value < this.plugin.settings.dayCanvas.endHour },
			{ key: "endHour", name: "Day canvas end hour", desc: "Last visible hour, after the start hour and up to 24 (midnight).", validate: value => value > this.plugin.settings.dayCanvas.startHour && value <= 24 },
			{ key: "defaultDuration", name: "Default block duration", desc: "Minutes used by Add duration, from 5 to 240. Entries without an end time reserve no interval.", validate: value => value >= 5 && value <= 240 },
		];
		return [
			...numbers.map((spec): SettingDefinitionItem => ({
				name: spec.name, desc: spec.desc,
				render: setting => { setting.addText(text => {
					text.inputEl.type = "number";
					text.setValue(String(this.plugin.settings.dayCanvas[spec.key])).onChange(async raw => {
						const value = Number(raw);
						const valid = raw.trim() !== "" && Number.isInteger(value) && spec.validate(value);
						text.inputEl.setCustomValidity(valid ? "" : spec.desc);
						text.inputEl.setAttribute("aria-invalid", String(!valid));
						if (!valid) return;
						this.plugin.settings.dayCanvas[spec.key] = value;
						await this.plugin.saveSettings();
					});
				}); },
			})),
			{
				name: "Day canvas storage",
				desc: "Use dedicated plans or daily notes named YYYY-MM-DD.md. Existing notes stay in their original folder when this changes.",
				render: setting => { setting.addDropdown(dropdown => dropdown
					.addOption("dedicated", "Dedicated day canvas notes").addOption("daily", "Daily notes")
					.setValue(this.plugin.settings.dayCanvas.storageMode).onChange(async value => {
						this.plugin.settings.dayCanvas.storageMode = value as DayPlannerSettings["storageMode"];
						await this.plugin.saveSettings();
					})); },
			},
			...(["plansFolder", "dailyNotesFolder"] as const).map((key): SettingDefinitionItem => ({
				name: key === "plansFolder" ? "Day canvas folder" : "Daily notes folder",
				desc: "Vault folder for YYYY-MM-DD.md plans. Leave empty for the vault root. Apply to use the new folder.",
				render: setting => {
					let draft = this.plugin.settings.dayCanvas[key];
					setting.addText(text => text.setValue(draft).onChange(value => { draft = value; }));
					setting.addButton(button => button.setButtonText("Apply").onClick(async () => {
						try {
							this.plugin.settings.dayCanvas[key] = vaultPath(draft);
							await this.plugin.saveSettings();
							button.setButtonText("Applied");
						} catch (error) { new Notice(String(error)); }
					}));
				},
			})),
		];
	}
}
