import { Plugin, WorkspaceLeaf } from "obsidian";
import { RoutineCardModal } from "./src/modals";
import { WeeklyPlannerSettingTab } from "./src/settings";
import {
	DEFAULT_SETTINGS,
	DayIndex,
	RoutineCard,
	WeeklyPlannerSettings,
	getCurrentDayIndex,
} from "./src/types";
import {
	VIEW_TYPE_WEEKLY_PLANNER,
	WeeklyPlannerView,
} from "./src/view";

export default class WeeklyRoutinePlannerPlugin extends Plugin {
	settings: WeeklyPlannerSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_WEEKLY_PLANNER,
			(leaf: WorkspaceLeaf) => new WeeklyPlannerView(leaf, this)
		);

		this.addRibbonIcon(
			"calendar-clock",
			"Open weekly routine board",
			() => {
				void this.activateView();
			}
		);

		this.addCommand({
			id: "open-weekly-board",
			name: "Open weekly board",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "add-routine-card",
			name: "Add routine card",
			callback: () => {
				new RoutineCardModal(this.app, {
					defaultDay: getCurrentDayIndex(),
					defaultTimed: false,
					onSave: async (card: RoutineCard) => {
						await this.upsertCard(card);
					},
				}).open();
			},
		});

		this.addSettingTab(new WeeklyPlannerSettingTab(this.app, this));
	}

	onunload(): void {
		// Obsidian restores leaf positions on reload; do not detach leaves here.
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_WEEKLY_PLANNER);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_WEEKLY_PLANNER,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	refreshViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_WEEKLY_PLANNER
		);
		for (const leaf of leaves) {
			if (leaf.view instanceof WeeklyPlannerView) {
				leaf.view.render();
			}
		}
	}

	async upsertCard(card: RoutineCard): Promise<void> {
		const existingIndex = this.settings.cards.findIndex(
			(c) => c.id === card.id
		);
		if (existingIndex >= 0) {
			this.settings.cards[existingIndex] = card;
		} else {
			this.settings.cards.push(card);
		}
		await this.saveSettings();
		this.refreshViews();
	}

	async deleteCard(cardId: string): Promise<void> {
		this.settings.cards = this.settings.cards.filter(
			(c) => c.id !== cardId
		);
		await this.saveSettings();
		this.refreshViews();
	}

	async removeCardFromDay(cardId: string, day: DayIndex): Promise<void> {
		const card = this.settings.cards.find((c) => c.id === cardId);
		if (!card) {
			return;
		}
		card.days = card.days.filter((d) => d !== day);
		if (card.days.length === 0) {
			this.settings.cards = this.settings.cards.filter(
				(c) => c.id !== cardId
			);
		}
		await this.saveSettings();
		this.refreshViews();
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<WeeklyPlannerSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
		if (!Array.isArray(this.settings.cards)) {
			this.settings.cards = [];
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
