import { ItemView, Platform, WorkspaceLeaf, setIcon } from "obsidian";
import type WeeklyRoutinePlannerPlugin from "../main";
import { RoutineCardModal } from "./modals";
import {
	DAYS_MONDAY_FIRST,
	DayIndex,
	DayMetadata,
	RoutineCard,
	formatTimeDisplay,
	getCurrentDayIndex,
	getOrderedDays,
} from "./types";

export const VIEW_TYPE_WEEKLY_PLANNER = "weekly-routine-board-view";

export class WeeklyPlannerView extends ItemView {
	plugin: WeeklyRoutinePlannerPlugin;
	private focusedDay: DayIndex | "all";
	private draggedCardId: string | null = null;
	private draggedSourceDay: DayIndex | null = null;
	private touchStartX: number | null = null;
	private touchStartY: number | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: WeeklyRoutinePlannerPlugin) {
		super(leaf);
		this.plugin = plugin;
		// Default to Today's focused view on mobile for immediate legibility,
		// and all 7 columns side-by-side on desktop.
		this.focusedDay = Platform.isMobile ? getCurrentDayIndex() : "all";
	}

	getViewType(): string {
		return VIEW_TYPE_WEEKLY_PLANNER;
	}

	getDisplayText(): string {
		return "Weekly routine board";
	}

	getIcon(): string {
		return "calendar-clock";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	public render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("wrp-view-container");
		contentEl.toggleClass(
			"wrp-compact-mode",
			this.plugin.settings.compactCards
		);
		contentEl.toggleClass("wrp-is-mobile", Platform.isMobile);

		this.renderToolbar(contentEl);
		this.renderMobileDayStrip(contentEl);
		this.renderBoard(contentEl);
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "wrp-toolbar" });

		const titleGroup = toolbar.createDiv({ cls: "wrp-toolbar-title-group" });
		const iconEl = titleGroup.createDiv({ cls: "wrp-toolbar-icon" });
		setIcon(iconEl, "calendar-clock");

		const textWrap = titleGroup.createDiv({ cls: "wrp-toolbar-text" });
		textWrap.createEl("h2", {
			text: "Weekly routine board",
			cls: "wrp-title",
		});
		const totalCards = this.plugin.settings.cards.length;
		textWrap.createDiv({
			text:
				totalCards === 1
					? "1 recurring card configured"
					: `${totalCards} recurring cards configured`,
			cls: "wrp-subtitle",
		});

		const controlsGroup = toolbar.createDiv({ cls: "wrp-toolbar-controls" });

		// Day filter pills (All days vs Today)
		const filterBar = controlsGroup.createDiv({ cls: "wrp-filter-bar" });
		const allBtn = filterBar.createEl("button", {
			text: "All days",
			cls: "wrp-filter-pill",
			attr: { type: "button" },
		});
		allBtn.toggleClass("is-active", this.focusedDay === "all");
		allBtn.addEventListener("click", () => {
			this.focusedDay = "all";
			this.render();
		});

		const todayIndex = getCurrentDayIndex();
		const todayBtn = filterBar.createEl("button", {
			text: "Today",
			cls: "wrp-filter-pill",
			attr: { type: "button" },
		});
		todayBtn.toggleClass("is-active", this.focusedDay === todayIndex);
		todayBtn.addEventListener("click", () => {
			this.focusedDay =
				this.focusedDay === todayIndex ? "all" : todayIndex;
			this.render();
		});

		// Primary Add Card CTA button
		const addBtn = controlsGroup.createEl("button", {
			cls: "mod-cta wrp-add-main-btn",
			attr: { type: "button" },
		});
		const addBtnIcon = addBtn.createSpan({ cls: "wrp-btn-icon" });
		setIcon(addBtnIcon, "plus");
		addBtn.createSpan({ text: "Add card" });
		addBtn.addEventListener("click", () => {
			const defaultDay =
				this.focusedDay === "all" ? getCurrentDayIndex() : this.focusedDay;
			this.openCardModal({ defaultDay, defaultTimed: false });
		});
	}

	/**
	 * Renders a thumb-friendly 7-day switcher bar on mobile (or whenever a single day is focused)
	 * so users can tap any day of the week or see card counts per day at a glance.
	 */
	private renderMobileDayStrip(container: HTMLElement): void {
		const orderedDays = getOrderedDays(
			this.plugin.settings.startWeekOnSunday,
			this.plugin.settings.showWeekends
		);
		const currentDayIndex = getCurrentDayIndex();

		const strip = container.createDiv({
			cls:
				this.focusedDay !== "all"
					? "wrp-day-strip is-visible"
					: "wrp-day-strip",
		});

		for (const day of orderedDays) {
			const dayCount = this.plugin.settings.cards.filter((c) =>
				c.days.includes(day.index)
			).length;
			const isSelected = this.focusedDay === day.index;
			const isToday =
				this.plugin.settings.highlightToday &&
				day.index === currentDayIndex;

			const tab = strip.createEl("button", {
				cls: "wrp-day-strip-tab",
				attr: {
					type: "button",
					"aria-label": `${day.fullName} (${dayCount} cards)`,
				},
			});
			tab.toggleClass("is-selected", isSelected);
			tab.toggleClass("is-today", isToday);

			tab.createSpan({
				text: day.shortName,
				cls: "wrp-day-strip-name",
			});
			tab.createSpan({
				text: String(dayCount),
				cls:
					dayCount > 0
						? "wrp-day-strip-count has-cards"
						: "wrp-day-strip-count",
			});

			tab.addEventListener("click", () => {
				this.focusedDay = day.index;
				this.render();
			});
		}
	}

	private stepFocusedDay(delta: number): void {
		const orderedDays = getOrderedDays(
			this.plugin.settings.startWeekOnSunday,
			this.plugin.settings.showWeekends
		);
		if (orderedDays.length === 0) {
			return;
		}
		const currentPos = orderedDays.findIndex(
			(d) => d.index === this.focusedDay
		);
		const startPos = currentPos >= 0 ? currentPos : 0;
		const nextPos =
			(startPos + delta + orderedDays.length) % orderedDays.length;
		this.focusedDay = orderedDays[nextPos].index;
		this.render();
	}

	private renderBoard(container: HTMLElement): void {
		const orderedDays = getOrderedDays(
			this.plugin.settings.startWeekOnSunday,
			this.plugin.settings.showWeekends
		);

		const visibleDays: DayMetadata[] =
			this.focusedDay === "all"
				? orderedDays
				: orderedDays.filter((d) => d.index === this.focusedDay);

		const board = container.createDiv({
			cls:
				visibleDays.length === 1
					? "wrp-board wrp-board-single"
					: "wrp-board",
		});

		// Enable horizontal touch swipe to switch days when viewing a single day
		if (visibleDays.length === 1) {
			board.addEventListener(
				"touchstart",
				(evt: TouchEvent) => {
					if (evt.touches.length === 1) {
						this.touchStartX = evt.touches[0].clientX;
						this.touchStartY = evt.touches[0].clientY;
					}
				},
				{ passive: true }
			);
			board.addEventListener(
				"touchend",
				(evt: TouchEvent) => {
					if (
						this.touchStartX === null ||
						this.touchStartY === null ||
						evt.changedTouches.length === 0
					) {
						return;
					}
					const dx = evt.changedTouches[0].clientX - this.touchStartX;
					const dy = evt.changedTouches[0].clientY - this.touchStartY;
					this.touchStartX = null;
					this.touchStartY = null;
					if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
						this.stepFocusedDay(dx < 0 ? 1 : -1);
					}
				},
				{ passive: true }
			);
		}

		const currentDayIndex = getCurrentDayIndex();

		for (const day of visibleDays) {
			const isToday =
				this.plugin.settings.highlightToday &&
				day.index === currentDayIndex;
			this.renderDayColumn(board, day, isToday, visibleDays.length === 1);
		}
	}

	private renderDayColumn(
		board: HTMLElement,
		day: DayMetadata,
		isToday: boolean,
		isSingleDayView = false
	): void {
		const col = board.createDiv({
			cls: isToday ? "wrp-day-column is-today" : "wrp-day-column",
		});

		// Day Header
		const header = col.createDiv({ cls: "wrp-day-header" });
		const headerLeft = header.createDiv({ cls: "wrp-day-header-left" });

		if (isSingleDayView) {
			const prevBtn = headerLeft.createEl("button", {
				cls: "clickable-icon wrp-icon-btn wrp-day-nav-btn",
				attr: {
					type: "button",
					"aria-label": "Previous day",
					title: "Previous day",
				},
			});
			setIcon(prevBtn, "chevron-left");
			prevBtn.addEventListener("click", () => {
				this.stepFocusedDay(-1);
			});
		}

		headerLeft.createSpan({
			text: day.fullName,
			cls: "wrp-day-name",
		});

		if (isToday) {
			headerLeft.createSpan({
				text: "Today",
				cls: "wrp-today-badge",
			});
		}

		if (isSingleDayView) {
			const nextBtn = headerLeft.createEl("button", {
				cls: "clickable-icon wrp-icon-btn wrp-day-nav-btn",
				attr: {
					type: "button",
					"aria-label": "Next day",
					title: "Next day",
				},
			});
			setIcon(nextBtn, "chevron-right");
			nextBtn.addEventListener("click", () => {
				this.stepFocusedDay(1);
			});
		}

		const headerActions = header.createDiv({
			cls: "wrp-day-header-actions",
		});

		const focusBtn = headerActions.createEl("button", {
			cls: "clickable-icon wrp-icon-btn",
			attr: {
				type: "button",
				"aria-label":
					this.focusedDay === day.index
						? "Show all days"
						: `Focus ${day.fullName}`,
				title:
					this.focusedDay === day.index
						? "Show all days"
						: `Focus ${day.fullName}`,
			},
		});
		setIcon(
			focusBtn,
			this.focusedDay === day.index ? "minimize-2" : "maximize-2"
		);
		focusBtn.addEventListener("click", () => {
			this.focusedDay =
				this.focusedDay === day.index ? "all" : day.index;
			this.render();
		});

		const quickAddBtn = headerActions.createEl("button", {
			cls: "clickable-icon wrp-icon-btn",
			attr: {
				type: "button",
				"aria-label": `Add card to ${day.fullName}`,
				title: `Add card to ${day.fullName}`,
			},
		});
		setIcon(quickAddBtn, "plus");
		quickAddBtn.addEventListener("click", () => {
			this.openCardModal({
				defaultDay: day.index,
				defaultTimed: false,
			});
		});

		// Filter cards for this day
		const dayCards = this.plugin.settings.cards.filter((card) =>
			card.days.includes(day.index)
		);
		const untimedCards = dayCards
			.filter((c) => !c.isTimed)
			.sort((a, b) => a.order - b.order);
		const timedCards = dayCards
			.filter((c) => c.isTimed)
			.sort((a, b) => a.startTime.localeCompare(b.startTime));

		// Section 1: Untimed / Overall Day Cards
		this.renderSection(col, {
			day,
			title: "Overall in the day",
			icon: "sun",
			isTimedSection: false,
			cards: untimedCards,
			emptyHint: "No untimed cards",
		});

		// Section 2: Timed Schedule Cards
		this.renderSection(col, {
			day,
			title: "Timed schedule",
			icon: "clock",
			isTimedSection: true,
			cards: timedCards,
			emptyHint: "No timed cards",
		});
	}

	private renderSection(
		col: HTMLElement,
		params: {
			day: DayMetadata;
			title: string;
			icon: string;
			isTimedSection: boolean;
			cards: RoutineCard[];
			emptyHint: string;
		}
	): void {
		const { day, title, icon, isTimedSection, cards, emptyHint } = params;
		const section = col.createDiv({
			cls: isTimedSection
				? "wrp-day-section wrp-section-timed"
				: "wrp-day-section wrp-section-untimed",
		});

		// Setup drag & drop target
		section.addEventListener("dragover", (evt: DragEvent) => {
			evt.preventDefault();
			section.addClass("is-drag-over");
		});
		section.addEventListener("dragleave", () => {
			section.removeClass("is-drag-over");
		});
		section.addEventListener("drop", (evt: DragEvent) => {
			evt.preventDefault();
			section.removeClass("is-drag-over");
			if (this.draggedCardId) {
				const cardId = this.draggedCardId;
				const sourceDay = this.draggedSourceDay;
				this.draggedCardId = null;
				this.draggedSourceDay = null;
				void this.handleCardDrop(
					cardId,
					sourceDay,
					day.index,
					isTimedSection,
					evt.altKey || evt.ctrlKey
				);
			}
		});

		// Section Header
		const secHeader = section.createDiv({ cls: "wrp-section-header" });
		const secTitleWrap = secHeader.createDiv({
			cls: "wrp-section-title-wrap",
		});
		const secIcon = secTitleWrap.createSpan({ cls: "wrp-section-icon" });
		setIcon(secIcon, icon);
		secTitleWrap.createSpan({
			text: title,
			cls: "wrp-section-title",
		});
		secTitleWrap.createSpan({
			text: String(cards.length),
			cls: "wrp-section-count",
		});

		const secAddBtn = secHeader.createEl("button", {
			cls: "clickable-icon wrp-section-add-btn",
			attr: {
				type: "button",
				"aria-label": isTimedSection
					? `Add timed card on ${day.fullName}`
					: `Add untimed card on ${day.fullName}`,
				title: isTimedSection
					? "Add timed card"
					: "Add overall day card",
			},
		});
		setIcon(secAddBtn, "plus");
		secAddBtn.addEventListener("click", () => {
			this.openCardModal({
				defaultDay: day.index,
				defaultTimed: isTimedSection,
			});
		});

		// Cards List
		const list = section.createDiv({ cls: "wrp-card-list" });
		if (cards.length === 0) {
			const emptyEl = list.createDiv({ cls: "wrp-empty-slot" });
			emptyEl.createSpan({ text: emptyHint, cls: "wrp-empty-text" });
			emptyEl.addEventListener("click", () => {
				this.openCardModal({
					defaultDay: day.index,
					defaultTimed: isTimedSection,
				});
			});
			return;
		}

		for (const card of cards) {
			this.renderCard(list, card, day.index);
		}
	}

	private renderCard(
		list: HTMLElement,
		card: RoutineCard,
		dayIndex: DayIndex
	): void {
		const cardEl = list.createDiv({
			cls: `wrp-card wrp-card-color-${card.color}`,
			attr: { draggable: "true" },
		});

		cardEl.addEventListener("dragstart", (evt: DragEvent) => {
			this.draggedCardId = card.id;
			this.draggedSourceDay = dayIndex;
			cardEl.addClass("is-dragging");
			if (evt.dataTransfer) {
				evt.dataTransfer.effectAllowed = "copyMove";
				evt.dataTransfer.setData("text/plain", card.id);
			}
		});

		cardEl.addEventListener("dragend", () => {
			cardEl.removeClass("is-dragging");
			this.draggedCardId = null;
			this.draggedSourceDay = null;
		});

		const hasBadges = Boolean(
			(card.isTimed && card.startTime) ||
				card.category ||
				card.days.length > 1
		);

		if (hasBadges) {
			const topBar = cardEl.createDiv({ cls: "wrp-card-top" });
			const badgesWrap = topBar.createDiv({ cls: "wrp-card-badges" });

			if (card.isTimed && card.startTime) {
				const timeBadge = badgesWrap.createSpan({
					cls: "wrp-time-badge",
				});
				const timeIcon = timeBadge.createSpan({
					cls: "wrp-time-badge-icon",
				});
				setIcon(timeIcon, "clock");

				const startFormatted = formatTimeDisplay(
					card.startTime,
					this.plugin.settings.use24HourFormat
				);
				const endFormatted = card.endTime
					? formatTimeDisplay(
							card.endTime,
							this.plugin.settings.use24HourFormat
						)
					: "";
				timeBadge.createSpan({
					text: endFormatted
						? `${startFormatted} – ${endFormatted}`
						: startFormatted,
				});
			}

			if (card.category) {
				badgesWrap.createSpan({
					text: card.category,
					cls: "wrp-category-badge",
				});
			}

			if (card.days.length > 1) {
				const repeatBadge = badgesWrap.createSpan({
					cls: "wrp-repeat-badge",
					attr: {
						title: this.formatDaysTooltip(card.days),
						"aria-label": this.formatDaysTooltip(card.days),
					},
				});
				const repeatIcon = repeatBadge.createSpan({
					cls: "wrp-repeat-icon",
				});
				setIcon(repeatIcon, "repeat");
				repeatBadge.createSpan({
					text:
						card.days.length === 7
							? "Daily"
							: `${card.days.length}d`,
				});
			}
		}

		// Main title
		cardEl.createDiv({
			text: card.title,
			cls: "wrp-card-title",
		});

		// Optional notes
		if (card.notes && !this.plugin.settings.compactCards) {
			cardEl.createDiv({
				text: card.notes,
				cls: "wrp-card-notes",
			});
		}

		// Floating delete/remove button on hover
		const deleteBtn = cardEl.createEl("button", {
			cls: "clickable-icon wrp-card-action-btn",
			attr: {
				type: "button",
				"aria-label":
					card.days.length > 1
						? "Remove from this day"
						: "Delete card",
				title:
					card.days.length > 1
						? "Remove from this day"
						: "Delete card",
			},
		});
		setIcon(deleteBtn, "x");
		deleteBtn.addEventListener("click", (evt: MouseEvent) => {
			evt.stopPropagation();
			void (async () => {
				if (card.days.length > 1) {
					await this.plugin.removeCardFromDay(card.id, dayIndex);
				} else {
					await this.plugin.deleteCard(card.id);
				}
			})();
		});

		cardEl.addEventListener("click", () => {
			this.openCardModal({
				existingCard: card,
				defaultDay: dayIndex,
			});
		});
	}

	private formatDaysTooltip(days: DayIndex[]): string {
		if (days.length === 7) {
			return "Repeats every day";
		}
		const names = days
			.map(
				(idx) =>
					DAYS_MONDAY_FIRST.find((d) => d.index === idx)?.shortName ??
					""
			)
			.filter(Boolean);
		return `Repeats on ${names.join(", ")}`;
	}

	private async handleCardDrop(
		cardId: string,
		sourceDay: DayIndex | null,
		targetDay: DayIndex,
		targetTimed: boolean,
		copyToDay: boolean
	): Promise<void> {
		const card = this.plugin.settings.cards.find((c) => c.id === cardId);
		if (!card) {
			return;
		}

		const updatedDays = new Set<DayIndex>(card.days);
		if (!copyToDay && sourceDay !== null && sourceDay !== targetDay) {
			updatedDays.delete(sourceDay);
		}
		updatedDays.add(targetDay);

		card.days = Array.from(updatedDays).sort((a, b) => a - b);
		card.isTimed = targetTimed;
		if (targetTimed && !card.startTime) {
			card.startTime = "07:00";
		}
		card.order = Date.now();

		await this.plugin.saveSettings();
		this.render();
	}

	public openCardModal(params: {
		existingCard?: RoutineCard;
		defaultDay?: DayIndex;
		defaultTimed?: boolean;
	}): void {
		new RoutineCardModal(this.app, {
			existingCard: params.existingCard,
			defaultDay: params.defaultDay,
			defaultTimed: params.defaultTimed,
			onSave: async (savedCard: RoutineCard) => {
				await this.plugin.upsertCard(savedCard);
			},
			onDelete: async (cardId: string) => {
				await this.plugin.deleteCard(cardId);
			},
			onRemoveFromDay: async (cardId: string, day: DayIndex) => {
				await this.plugin.removeCardFromDay(cardId, day);
			},
		}).open();
	}
}
