import { App, Modal, Notice, Setting } from "obsidian";
import {
	CARD_COLORS,
	CardColor,
	DAYS_MONDAY_FIRST,
	DayIndex,
	RoutineCard,
	generateCardId,
	parseFlexibleTime,
} from "./types";

export interface CardModalOptions {
	existingCard?: RoutineCard;
	defaultDay?: DayIndex;
	defaultTimed?: boolean;
	onSave: (card: RoutineCard) => Promise<void>;
	onDelete?: (cardId: string) => Promise<void>;
	onRemoveFromDay?: (cardId: string, day: DayIndex) => Promise<void>;
}

export class RoutineCardModal extends Modal {
	private options: CardModalOptions;
	private titleText: string;
	private categoryText: string;
	private notesText: string;
	private selectedDays: Set<DayIndex>;
	private isTimed: boolean;
	private startTime: string;
	private endTime: string;
	private color: CardColor;

	constructor(app: App, options: CardModalOptions) {
		super(app);
		this.options = options;

		const existing = options.existingCard;
		this.titleText = existing?.title ?? "";
		this.categoryText = existing?.category ?? "";
		this.notesText = existing?.notes ?? "";
		this.selectedDays = new Set<DayIndex>(
			existing?.days?.length
				? existing.days
				: [options.defaultDay ?? 0]
		);
		this.isTimed = existing ? existing.isTimed : (options.defaultTimed ?? false);
		this.startTime = existing?.startTime || "07:00";
		this.endTime = existing?.endTime || "";
		this.color = existing?.color ?? "default";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("wrp-modal");

		const isEditing = Boolean(this.options.existingCard);
		contentEl.createEl("h2", {
			text: isEditing ? "Edit routine card" : "Add routine card",
			cls: "wrp-modal-title",
		});

		// Title field
		new Setting(contentEl)
			.setName("Title")
			.setDesc("What do you regularly do on this day?")
			.addText((text) => {
				text
					.setPlaceholder("Laundry, wake up, clean apartment...")
					.setValue(this.titleText)
					.onChange((value) => {
						this.titleText = value;
					});
				text.inputEl.addClass("wrp-input-full");
				window.setTimeout(() => text.inputEl.focus(), 20);
				text.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
					if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
						evt.preventDefault();
						void this.handleSave();
					}
				});
			});

		// Days of the week selection
		const daysSection = contentEl.createDiv({ cls: "wrp-modal-section" });
		daysSection.createDiv({
			text: "Days of the week",
			cls: "wrp-modal-label",
		});
		daysSection.createDiv({
			text: "Select one or multiple days for this card.",
			cls: "wrp-modal-sublabel",
		});

		const dayButtonsContainer = daysSection.createDiv({
			cls: "wrp-day-selector",
		});
		const dayButtons = new Map<DayIndex, HTMLButtonElement>();

		const updateDayButtonStates = (): void => {
			dayButtons.forEach((btn, idx) => {
				btn.toggleClass("is-selected", this.selectedDays.has(idx));
			});
		};

		for (const dayMeta of DAYS_MONDAY_FIRST) {
			const btn = dayButtonsContainer.createEl("button", {
				text: dayMeta.shortName,
				cls: "wrp-day-pill",
				attr: { type: "button", "aria-label": dayMeta.fullName },
			});
			dayButtons.set(dayMeta.index, btn);
			btn.addEventListener("click", () => {
				if (this.selectedDays.has(dayMeta.index)) {
					if (this.selectedDays.size > 1) {
						this.selectedDays.delete(dayMeta.index);
					}
				} else {
					this.selectedDays.add(dayMeta.index);
				}
				updateDayButtonStates();
			});
		}
		updateDayButtonStates();

		// Quick preset buttons for days
		const presetsRow = daysSection.createDiv({ cls: "wrp-day-presets" });
		const addPresetBtn = (label: string, indices: DayIndex[]): void => {
			const presetBtn = presetsRow.createEl("button", {
				text: label,
				cls: "wrp-preset-btn",
				attr: { type: "button" },
			});
			presetBtn.addEventListener("click", () => {
				this.selectedDays = new Set<DayIndex>(indices);
				updateDayButtonStates();
			});
		};

		addPresetBtn("Every day", [0, 1, 2, 3, 4, 5, 6]);
		addPresetBtn("Weekdays", [0, 1, 2, 3, 4]);
		addPresetBtn("Weekends", [5, 6]);

		// Timing section
		const timeFieldsContainer = contentEl.createDiv({
			cls: "wrp-time-fields-container",
		});

		const updateTimeFieldsVisibility = (): void => {
			timeFieldsContainer.toggleClass("is-hidden", !this.isTimed);
		};

		new Setting(contentEl)
			.setName("Tie to a specific time")
			.setDesc(
				"Turn off for overall day tasks (like laundry), or turn on for scheduled hours (like waking up at 07:00)."
			)
			.addToggle((toggle) => {
				toggle.setValue(this.isTimed).onChange((value) => {
					this.isTimed = value;
					updateTimeFieldsVisibility();
				});
			});

		// Move timeFieldsContainer right after the toggle setting
		contentEl.appendChild(timeFieldsContainer);

		const timeRow = timeFieldsContainer.createDiv({ cls: "wrp-time-row" });

		const startGroup = timeRow.createDiv({ cls: "wrp-time-group" });
		startGroup.createEl("label", {
			text: "Start time",
			cls: "wrp-time-label",
		});
		const startInput = startGroup.createEl("input", {
			type: "text",
			cls: "wrp-time-input",
			value: this.startTime,
			attr: {
				placeholder: "07:00 (or 7, 7:30, 7-8)",
				autocomplete: "off",
				spellcheck: "false",
			},
		});

		const endGroup = timeRow.createDiv({ cls: "wrp-time-group" });
		endGroup.createEl("label", {
			text: "End time (optional)",
			cls: "wrp-time-label",
		});
		const endInput = endGroup.createEl("input", {
			type: "text",
			cls: "wrp-time-input",
			value: this.endTime,
			attr: {
				placeholder: "08:00 (optional)",
				autocomplete: "off",
				spellcheck: "false",
			},
		});

		const normalizeStartInput = (): void => {
			const raw = startInput.value.trim();
			// Support typing a range directly like "7-8" or "07:00 - 08:30"
			if (raw.includes("-") || raw.includes("–")) {
				const parts = raw.split(/[-–]/);
				const parsedStart = parseFlexibleTime(parts[0] ?? "");
				const parsedEnd = parseFlexibleTime(parts[1] ?? "");
				if (parsedStart) {
					this.startTime = parsedStart;
					startInput.value = parsedStart;
				}
				if (parsedEnd) {
					this.endTime = parsedEnd;
					endInput.value = parsedEnd;
				}
				return;
			}
			const parsed = parseFlexibleTime(raw);
			if (parsed) {
				this.startTime = parsed;
				startInput.value = parsed;
			} else {
				this.startTime = raw;
			}
		};

		const normalizeEndInput = (): void => {
			const raw = endInput.value.trim();
			if (!raw) {
				this.endTime = "";
				endInput.value = "";
				return;
			}
			const parsed = parseFlexibleTime(raw);
			if (parsed) {
				this.endTime = parsed;
				endInput.value = parsed;
			} else {
				this.endTime = raw;
			}
		};

		startInput.addEventListener("input", () => {
			this.startTime = startInput.value;
		});
		startInput.addEventListener("blur", normalizeStartInput);

		endInput.addEventListener("input", () => {
			this.endTime = endInput.value;
		});
		endInput.addEventListener("blur", normalizeEndInput);

		// Quick-tap time chips (great on phone & desktop)
		const quickTimesRow = timeFieldsContainer.createDiv({
			cls: "wrp-quick-times",
		});
		const quickTimes = ["07:00", "08:00", "12:00", "15:00", "18:00", "20:00"];
		for (const qt of quickTimes) {
			const chip = quickTimesRow.createEl("button", {
				text: qt,
				cls: "wrp-preset-btn wrp-time-chip",
				attr: { type: "button" },
			});
			chip.addEventListener("click", () => {
				this.startTime = qt;
				startInput.value = qt;
			});
		}

		timeFieldsContainer.createDiv({
			text: "Tip: Type times directly like 7, 07:30, 1830, or a range like 7-8.",
			cls: "wrp-time-hint",
		});

		updateTimeFieldsVisibility();

		// Category / tag field
		new Setting(contentEl)
			.setName("Category label")
			.setDesc("Optional short tag such as chores, morning, or uni.")
			.addText((text) => {
				text
					.setPlaceholder("Optional label...")
					.setValue(this.categoryText)
					.onChange((value) => {
						this.categoryText = value;
					});
			});

		// Color swatch picker
		const colorSection = contentEl.createDiv({ cls: "wrp-modal-section" });
		colorSection.createDiv({
			text: "Card color",
			cls: "wrp-modal-label",
		});
		const swatchesRow = colorSection.createDiv({ cls: "wrp-color-swatches" });
		const swatchButtons = new Map<CardColor, HTMLButtonElement>();

		const updateSwatchSelection = (): void => {
			swatchButtons.forEach((btn, c) => {
				btn.toggleClass("is-selected", this.color === c);
			});
		};

		for (const item of CARD_COLORS) {
			const swatch = swatchesRow.createEl("button", {
				cls: `wrp-color-swatch wrp-swatch-${item.value}`,
				attr: {
					type: "button",
					"aria-label": item.label,
					title: item.label,
				},
			});
			swatch.createSpan({ text: item.label, cls: "wrp-swatch-label" });
			swatchButtons.set(item.value, swatch);
			swatch.addEventListener("click", () => {
				this.color = item.value;
				updateSwatchSelection();
			});
		}
		updateSwatchSelection();

		// Notes field
		const notesSection = contentEl.createDiv({ cls: "wrp-modal-section" });
		notesSection.createDiv({
			text: "Notes (optional)",
			cls: "wrp-modal-label",
		});
		const notesArea = notesSection.createEl("textarea", {
			cls: "wrp-notes-textarea",
			attr: {
				rows: "3",
				placeholder: "Add any extra details or reminders...",
			},
		});
		notesArea.value = this.notesText;
		notesArea.addEventListener("input", () => {
			this.notesText = notesArea.value;
		});

		// Footer actions
		const footer = contentEl.createDiv({ cls: "wrp-modal-footer" });
		const leftActions = footer.createDiv({ cls: "wrp-modal-footer-left" });
		const rightActions = footer.createDiv({ cls: "wrp-modal-footer-right" });

		if (
			this.options.existingCard &&
			this.options.onDelete
		) {
			const existingCard = this.options.existingCard;
			const deleteBtn = leftActions.createEl("button", {
				text: "Delete card",
				cls: "mod-warning",
				attr: { type: "button" },
			});
			deleteBtn.addEventListener("click", () => {
				void (async () => {
					if (this.options.onDelete) {
						await this.options.onDelete(existingCard.id);
					}
					this.close();
				})();
			});

			if (
				this.options.defaultDay !== undefined &&
				existingCard.days.length > 1 &&
				this.options.onRemoveFromDay
			) {
				const targetDay = this.options.defaultDay;
				const dayMeta = DAYS_MONDAY_FIRST.find(
					(d) => d.index === targetDay
				);
				const removeDayBtn = leftActions.createEl("button", {
					text: `Remove from ${dayMeta ? dayMeta.shortName : "day"}`,
					cls: "wrp-btn-secondary",
					attr: { type: "button" },
				});
				removeDayBtn.addEventListener("click", () => {
					void (async () => {
						if (this.options.onRemoveFromDay) {
							await this.options.onRemoveFromDay(
								existingCard.id,
								targetDay
							);
						}
						this.close();
					})();
				});
			}
		}

		const cancelBtn = rightActions.createEl("button", {
			text: "Cancel",
			attr: { type: "button" },
		});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});

		const saveBtn = rightActions.createEl("button", {
			text: isEditing ? "Save changes" : "Add card",
			cls: "mod-cta",
			attr: { type: "button" },
		});
		saveBtn.addEventListener("click", () => {
			void this.handleSave();
		});
	}

	private async handleSave(): Promise<void> {
		const trimmedTitle = this.titleText.trim();
		if (!trimmedTitle) {
			new Notice("Please enter a card title.");
			return;
		}
		if (this.selectedDays.size === 0) {
			new Notice("Please select at least one day of the week.");
			return;
		}

		const sortedDays: DayIndex[] = Array.from(this.selectedDays).sort(
			(a, b) => a - b
		);

		let resolvedStart = "";
		let resolvedEnd = "";

		if (this.isTimed) {
			const rawStart = this.startTime.trim();
			if (rawStart.includes("-") || rawStart.includes("–")) {
				const parts = rawStart.split(/[-–]/);
				const pStart = parseFlexibleTime(parts[0] ?? "");
				const pEnd = parseFlexibleTime(parts[1] ?? "");
				if (!pStart) {
					new Notice("Please enter a valid start time (for example 07:00 or 7:30).");
					return;
				}
				resolvedStart = pStart;
				if (pEnd && !this.endTime.trim()) {
					resolvedEnd = pEnd;
				}
			} else {
				const parsedStart = parseFlexibleTime(rawStart);
				if (!parsedStart) {
					new Notice("Please enter a valid start time (for example 07:00 or 7:30).");
					return;
				}
				resolvedStart = parsedStart;
			}

			if (!resolvedEnd && this.endTime.trim()) {
				const parsedEnd = parseFlexibleTime(this.endTime.trim());
				if (!parsedEnd) {
					new Notice("Please enter a valid end time (for example 08:00 or 18:30).");
					return;
				}
				resolvedEnd = parsedEnd;
			}
		}

		const existing = this.options.existingCard;
		const card: RoutineCard = {
			id: existing?.id ?? generateCardId(),
			title: trimmedTitle,
			category: this.categoryText.trim(),
			notes: this.notesText.trim(),
			days: sortedDays,
			isTimed: this.isTimed,
			startTime: resolvedStart,
			endTime: resolvedEnd,
			color: this.color,
			order: existing?.order ?? Date.now(),
		};

		await this.options.onSave(card);
		this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
