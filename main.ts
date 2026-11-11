import { DayCanvasItemView, DAY_CANVAS_VIEW_TYPE } from "./src/dayCanvas/view";
import { DayPlanRepository } from "./src/dayCanvas/repository";
import { normalizeDayCanvasSettings } from "./src/dayCanvas/settings";
import { normalizePath, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { MarkdownRoutineRepository } from "./src/markdownStore";
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
	repo!: MarkdownRoutineRepository;
	dayRepository!: DayPlanRepository;
	private isSaving = false;

	async onload(): Promise<void> {
		this.repo = new MarkdownRoutineRepository(this.app);
		await this.loadSettings();
		this.dayRepository = new DayPlanRepository(this.app, () => ({
			...this.settings.dayCanvas,
			routinesFilePath: this.settings.notePath,
		}));
		this.registerView(DAY_CANVAS_VIEW_TYPE, leaf => new DayCanvasItemView(leaf, this));
		this.addCommand({
			id: "open-day-canvas",
			name: "Open day canvas",
			callback: () => { void this.activateDayCanvas(); },
		});
		const notifyDayPlan = (file: { path: string }): void => this.dayRepository.notify(file.path);
		this.registerEvent(this.app.vault.on("modify", notifyDayPlan));
		this.registerEvent(this.app.vault.on("create", notifyDayPlan));
		this.registerEvent(this.app.vault.on("delete", notifyDayPlan));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
			this.dayRepository.notify(oldPath);
			this.dayRepository.notify(file.path);
		}));

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
			id: "open-routines-markdown-note",
			name: "Open routines markdown note",
			callback: () => {
				void this.openMarkdownNote();
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

		this.registerEvent(
			this.app.vault.on("modify", async (file) => {
				if (!this.isSaving && file.path === normalizePath(this.settings.notePath)) {
					await this.reloadFromMarkdown();
				}
			})
		);
	}

	onunload(): void {
		// Obsidian restores leaf positions on reload; do not detach leaves here.
	}

	async activateDayCanvas(): Promise<void> {
		const workspace = this.app.workspace;
		const existing = workspace.getLeavesOfType(DAY_CANVAS_VIEW_TYPE)[0];
		const leaf = existing ?? workspace.getLeaf(false);
		if (!existing) await leaf.setViewState({ type: DAY_CANVAS_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
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

	async openMarkdownNote(): Promise<void> {
		const norm = normalizePath(this.settings.notePath);
		const file = this.app.vault.getAbstractFileByPath(norm);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			if (leaf) {
				await leaf.openFile(file);
			}
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

	async reloadFromMarkdown(): Promise<void> {
		const loadedCards = await this.repo.loadCards(this.settings.notePath);
		if (loadedCards !== null) {
			this.settings.cards = loadedCards;
			await this.saveData(this.settings);
			this.refreshViews();
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
		let daySettings: unknown = loaded?.dayCanvas;
		if (!daySettings) {
			// Adopt existing standalone settings once; its Markdown plans keep their paths.
			const legacyPath = normalizePath(`${this.app.vault.configDir}/plugins/day-canvas/data.json`);
			try {
				if (await this.app.vault.adapter.exists(legacyPath)) {
					daySettings = JSON.parse(await this.app.vault.adapter.read(legacyPath));
				}
			} catch { /* Missing or invalid legacy settings leave the defaults in place. */ }
		}
		this.settings.dayCanvas = normalizeDayCanvasSettings(daySettings);
		if (!this.settings.notePath) {
			this.settings.notePath = DEFAULT_SETTINGS.notePath;
		}
		if (!Array.isArray(this.settings.cards)) {
			this.settings.cards = [];
		}

		// Try loading cards from the Markdown backend
		const markdownCards = await this.repo.loadCards(this.settings.notePath);
		if (markdownCards !== null) {
			this.settings.cards = markdownCards;
		} else {
			// First run or migration: write cards to Markdown backend
			await this.repo.saveCards(this.settings.notePath, this.settings.cards);
		}
		await this.saveData(this.settings);
	}

	async saveSettings(): Promise<void> {
		this.isSaving = true;
		try {
			await this.repo.saveCards(this.settings.notePath, this.settings.cards);
			await this.saveData(this.settings);
			this.dayRepository?.notify();
		} finally {
			this.isSaving = false;
		}
	}
}
