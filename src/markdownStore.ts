import { App, normalizePath, parseYaml, stringifyYaml, TFile } from "obsidian";
import { DAYS_MONDAY_FIRST, RoutineCard } from "./types";

export function buildMarkdownFromCards(cards: RoutineCard[]): string {
	const frontmatterObj = {
		weekly_routine_board: true,
		updated_at: new Date().toISOString(),
		cards: cards,
	};
	const yamlStr = stringifyYaml(frontmatterObj).trim();

	const lines: string[] = [
		"---",
		yamlStr,
		"---",
		"",
		"# Weekly Routine Board",
		"",
		"> Managed by the **Weekly Routine Board** plugin. Changes made in the board view are saved here automatically.",
		"",
	];

	for (const day of DAYS_MONDAY_FIRST) {
		lines.push(`## ${day.fullName}`);
		const dayCards = cards
			.filter((c) => c.days.includes(day.index))
			.sort((a, b) => {
				if (a.isTimed && b.isTimed) {
					return a.startTime.localeCompare(b.startTime);
				}
				if (a.isTimed && !b.isTimed) return -1;
				if (!a.isTimed && b.isTimed) return 1;
				return a.order - b.order;
			});

		if (dayCards.length === 0) {
			lines.push("*No recurring routines.*");
		} else {
			for (const card of dayCards) {
				const timePart = card.isTimed
					? card.endTime
						? `${card.startTime} - ${card.endTime} `
						: `${card.startTime} `
					: "";
				const catPart = card.category ? ` #${card.category}` : "";
				const notePart = card.notes
					? ` — ${card.notes.replace(/\r?\n/g, " ")}`
					: "";
				lines.push(`- [ ] ${timePart}${card.title}${catPart}${notePart}`);
			}
		}
		lines.push("");
	}

	return lines.join("\n");
}

function asString(val: unknown, fallback = ""): string {
	return typeof val === "string" ? val : fallback;
}

function asNumber(val: unknown, fallback = 0): number {
	return typeof val === "number" ? val : Number(val) || fallback;
}

export function parseCardsFromMarkdown(content: string): RoutineCard[] | null {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	const yamlStr = match[1];
	try {
		const fm = parseYaml(yamlStr) as Record<string, unknown> | null;
		if (fm && Array.isArray(fm.cards)) {
			const rawCards = fm.cards as Record<string, unknown>[];
			return rawCards.map((r, idx) => ({
				id: asString(r.id, `card-${Date.now().toString(36)}-${idx}`),
				title: asString(r.title),
				notes: asString(r.notes),
				category: asString(r.category),
				days: Array.isArray(r.days) ? (r.days as unknown[]).map((d) => Number(d) as RoutineCard["days"][number]) : [0],
				isTimed: Boolean(r.isTimed),
				startTime: asString(r.startTime),
				endTime: asString(r.endTime),
				color: asString(r.color, "default") as RoutineCard["color"],
				order: asNumber(r.order, Date.now() + idx),
			}));
		}
	} catch {
		// ignore parsing error
	}
	return null;
}

export class MarkdownRoutineRepository {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const parts = normalizePath(folderPath).split("/").filter(Boolean);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			try {
				const existsOnDisk = await this.app.vault.adapter.exists(current);
				if (!existsOnDisk) {
					await this.app.vault.adapter.mkdir(current);
				}
			} catch {
				// Ignore if created concurrently
			}
		}
	}

	public async readFileSafe(path: string): Promise<string | null> {
		const norm = normalizePath(path);
		const abstractFile = this.app.vault.getAbstractFileByPath(norm);
		if (abstractFile instanceof TFile) {
			return await this.app.vault.read(abstractFile);
		}
		if (await this.app.vault.adapter.exists(norm)) {
			return await this.app.vault.adapter.read(norm);
		}
		return null;
	}

	public async writeFileSafe(path: string, content: string): Promise<void> {
		const norm = normalizePath(path);
		const folder = norm.includes("/") ? norm.substring(0, norm.lastIndexOf("/")) : "";
		if (folder) {
			await this.ensureFolderExists(folder);
		}
		const abstractFile = this.app.vault.getAbstractFileByPath(norm);
		if (abstractFile instanceof TFile) {
			await this.app.vault.modify(abstractFile, content);
			return;
		}
		await this.app.vault.adapter.write(norm, content);
	}

	public async loadCards(notePath: string): Promise<RoutineCard[] | null> {
		const content = await this.readFileSafe(notePath);
		if (content === null) {
			return null;
		}
		return parseCardsFromMarkdown(content);
	}

	public async saveCards(notePath: string, cards: RoutineCard[]): Promise<void> {
		const markdown = buildMarkdownFromCards(cards);
		await this.writeFileSafe(notePath, markdown);
	}
}
