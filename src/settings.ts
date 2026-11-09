import { App, PluginSettingTab, Setting } from "obsidian";
import type WeeklyRoutinePlannerPlugin from "../main";

export class WeeklyPlannerSettingTab extends PluginSettingTab {
	plugin: WeeklyRoutinePlannerPlugin;

	constructor(app: App, plugin: WeeklyRoutinePlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Start week on Sunday")
			.setDesc(
				"Display Sunday as the first column instead of Monday."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.startWeekOnSunday)
					.onChange(async (value) => {
						this.plugin.settings.startWeekOnSunday = value;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("Use 24-hour time format")
			.setDesc(
				"Display times as 14:00 instead of 2:00 PM on timed cards."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.use24HourFormat)
					.onChange(async (value) => {
						this.plugin.settings.use24HourFormat = value;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("Show weekend columns")
			.setDesc("Include Saturday and Sunday on the weekly board.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showWeekends)
					.onChange(async (value) => {
						this.plugin.settings.showWeekends = value;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("Highlight current day")
			.setDesc(
				"Emphasize the column corresponding to the current day of the week."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.highlightToday)
					.onChange(async (value) => {
						this.plugin.settings.highlightToday = value;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);

		new Setting(containerEl)
			.setName("Compact card display")
			.setDesc(
				"Hide card notes on the board so more cards fit in each day column."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.compactCards)
					.onChange(async (value) => {
						this.plugin.settings.compactCards = value;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					})
			);
	}
}
