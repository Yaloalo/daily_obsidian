import { ItemView, WorkspaceLeaf } from "obsidian";
import { mount, unmount } from "svelte";
import type WeeklyRoutinePlannerPlugin from "../../main";
import DayCanvasView from "./DayCanvasView.svelte";

export const DAY_CANVAS_VIEW_TYPE = "weekly-routine-board-day-canvas";

export class DayCanvasItemView extends ItemView {
	private component: ReturnType<typeof mount> | null = null;
	constructor(leaf: WorkspaceLeaf, private plugin: WeeklyRoutinePlannerPlugin) { super(leaf); }
	getViewType(): string { return DAY_CANVAS_VIEW_TYPE; }
	getDisplayText(): string { return "Day canvas"; }
	getIcon(): string { return "calendar-days"; }

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("day-canvas-view");
		this.component = mount(DayCanvasView, {
			target: this.contentEl,
			props: {
				repository: this.plugin.dayRepository,
				onOpenWeekly: () => this.plugin.activateView(),
				onOpenNote: async (date: string) => {
					const file = await this.plugin.dayRepository.ensureNote(date);
					await this.app.workspace.getLeaf("tab").openFile(file);
				},
			},
		});
		return Promise.resolve();
	}

	async onClose(): Promise<void> {
		if (this.component) await unmount(this.component);
		this.component = null;
	}
}
