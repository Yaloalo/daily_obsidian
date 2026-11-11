<script lang="ts">
	import { onMount } from 'svelte';
	import type { DayPlanRepository } from './repository';
	import { mergeChanges } from './markdown';
	import { isVisible, layoutBlocks } from './layout';
	import { dropTimeAtPointer, firstFreeTime, moveBlock, setBlockTime } from './scheduling';
	import { COLORS, DEFAULT_SETTINGS, type BacklogTask, type DayPlan, type TimeBlock } from './types';
	import { dateKey, minutes, newId, shiftDate, timeString } from './time';

	let { repository, onOpenNote, onOpenWeekly }: { repository: DayPlanRepository; onOpenNote: (date: string) => Promise<void>; onOpenWeekly: () => Promise<void> } = $props();
	let settings = $state({ ...DEFAULT_SETTINGS });
	let activePath = $state('');
	let date = $state(dateKey());
	let plan = $state<DayPlan | null>(null);
	let baseline: DayPlan | null = null;
	let loading = $state(true);
	let refreshing = $state(false);
	let saving = $state(false);
	let dirty = $state(false);
	let error = $state('');
	let validation = $state('');
	let selectedId = $state<string | null>(null);
	let draggedId = $state<string | null>(null);
	let dropMinute = $state<number | null>(null);
	let now = $state(new Date());
	let disposed = false;
	let refreshRequested = false;
	let revision = 0;
	let loadRequest = 0;
	const scale = 2.4;
	const start = $derived(settings.startHour * 60);
	const end = $derived(settings.endHour * 60);
	const hours = $derived(Array.from({ length: settings.endHour - settings.startHour }, (_, index) => settings.startHour + index));
	const positioned = $derived(layoutBlocks(plan?.blocks ?? [], start, end, scale));
	const selected = $derived(plan?.blocks.find(block => block.id === selectedId));
	const outsideHours = $derived(plan?.blocks.filter(block => !isVisible(block, start, end)) ?? []);
	const completed = $derived(plan ? [...plan.blocks, ...plan.backlog].filter(task => task.completed).length : 0);
	const total = $derived((plan?.blocks.length ?? 0) + (plan?.backlog.length ?? 0));
	const nowMinute = $derived(now.getHours() * 60 + now.getMinutes());
	const displayDate = $derived(new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }));

	function snapshot(value: DayPlan): DayPlan { return JSON.parse(JSON.stringify(value)); }
	function message(value: unknown): string { return value instanceof Error ? value.message : String(value); }

	async function loadDate(nextDate = date, background = false) {
		if (dirty || saving) { refreshRequested = true; return; }
		if ((background && (loading || refreshing)) || (!background && loading && plan)) { refreshRequested = true; return; }
		const request = ++loadRequest;
		const observedRevision = revision;
		if (background) refreshing = true; else loading = true;
		refreshRequested = false;
		error = '';
		try {
			const path = repository.pathFor(nextDate);
			const result = await repository.load(nextDate);
			if (disposed || request !== loadRequest) return;
			if (background && (observedRevision !== revision || dirty || saving)) { refreshRequested = true; return; }
			date = nextDate;
			plan = result;
			activePath = path;
			baseline = snapshot(result);
			settings = { ...repository.settings };
			if (!result.blocks.some(block => block.id === selectedId)) selectedId = null;
		} catch (cause) { if (request === loadRequest) error = message(cause); }
		finally {
			if (background) refreshing = false;
			if (request === loadRequest) {
				loading = false;
				if (refreshRequested && !error && !dirty && !saving && !disposed) void loadDate(date, true);
			}
		}
	}

	function commit() {
		dirty = true;
		revision++;
		validation = '';
		void flush();
	}

	async function flush() {
		if (saving || !plan || !baseline) return;
		saving = true;
		error = '';
		try {
			while (dirty && plan && baseline) {
				const sent = snapshot(plan);
				const sentRevision = revision;
				const saved = await repository.save(snapshot(baseline), sent, activePath);
				if (sentRevision === revision) { plan = saved; dirty = false; }
				else plan = mergeChanges(sent, snapshot(plan), saved);
				baseline = snapshot(saved);
			}
		} catch (cause) { error = `Could not save: ${message(cause)}`; }
		finally {
			saving = false;
			if (refreshRequested && !dirty && !disposed) void loadDate(date, true);
		}
	}

	onMount(() => {
		settings = { ...repository.settings };
		const unsubscribe = repository.subscribe(path => {
			if (disposed) return;
			let relevant = !path || path === settings.routinesFilePath;
			try { relevant ||= path === repository.pathFor(date); } catch { relevant = true; }
			if (!relevant) return;
			if (saving || dirty || loading || refreshing) refreshRequested = true;
			else void loadDate(date, true);
		});
		void loadDate();
		const timer = window.setInterval(() => { now = new Date(); }, 30000);
		return () => { disposed = true; unsubscribe(); window.clearInterval(timer); };
	});

	function addBlock(at = Math.min(end - 15, Math.max(start, Math.ceil(nowMinute / 15) * 15))) {
		if (!plan) return;
		const block: TimeBlock = { id: newId(), title: 'New entry', completed: false, color: 'blue', startTime: timeString(at) };
		plan.blocks.push(block);
		selectedId = block.id;
		commit();
	}

	function addTask() {
		if (!plan) return;
		plan.backlog.push({ id: newId(), title: 'New task', completed: false, color: 'blue' });
		commit();
	}

	function remove(id: string) {
		if (!plan) return;
		plan.blocks = plan.blocks.filter(block => block.id !== id);
		plan.backlog = plan.backlog.filter(task => task.id !== id);
		if (selectedId === id) selectedId = null;
		commit();
	}

	function unschedule(block: TimeBlock) {
		if (!plan) return;
		const { startTime, endTime, ...task } = block;
		plan.blocks = plan.blocks.filter(item => item.id !== block.id);
		plan.backlog.push(task);
		selectedId = null;
		commit();
	}

	function schedule(task: BacklogTask, at?: number) {
		if (!plan) return;
		if (at === undefined) {
			const available = firstFreeTime(plan.blocks, start, end);
			if (available === null) { validation = 'No free time in the visible hours. Drop the task onto a time or extend the calendar hours.'; return; }
			at = available;
		}
		const block = { ...task, startTime: timeString(at) };
		plan.backlog = plan.backlog.filter(item => item.id !== task.id);
		plan.blocks.push(block);
		selectedId = block.id;
		commit();
	}

	function startDrag(event: DragEvent, id: string) {
		draggedId = id;
		event.dataTransfer?.setData('application/x-day-canvas-task', id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}

	function dragTime(event: DragEvent & { currentTarget: HTMLDivElement }): number {
		return dropTimeAtPointer(event.clientY, event.currentTarget.getBoundingClientRect().top, start, end, scale);
	}

	function dragOver(event: DragEvent & { currentTarget: HTMLDivElement }) {
		if (!draggedId || loading) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		dropMinute = dragTime(event);
	}

	function drop(event: DragEvent & { currentTarget: HTMLDivElement }) {
		if (!draggedId || loading) return;
		event.preventDefault();
		if (!plan) return;
		const at = dragTime(event);
		const id = draggedId;
		draggedId = null;
		dropMinute = null;
		if (!id) return;
		const task = plan.backlog.find(item => item.id === id);
		if (task) { schedule(task, at); return; }
		const block = plan.blocks.find(item => item.id === id);
		if (block) {
			moveBlock(block, at);
			commit();
		}
	}

	function changeTime(block: TimeBlock, key: 'startTime' | 'endTime', input: HTMLInputElement) {
		if (!setBlockTime(block, key, input.value)) {
			validation = 'Use HH:MM with an optional end after the start. Leave End empty for a single-time entry. Midnight is 24:00 for an end only.';
			input.value = block[key] ?? '';
			return;
		}
		commit();
	}

	async function openNote() {
		try { await onOpenNote(date); } catch (cause) { error = message(cause); }
	}
</script>

<div class="dc-container" aria-busy={loading}>
	<header class="dc-header">
		<div class="dc-heading"><span class="dc-eyebrow">DAY CANVAS</span><h2>{displayDate}</h2></div>
		<div class="dc-header-actions">
			<button disabled={saving || dirty} onclick={async () => { try { await onOpenWeekly(); } catch (cause) { error = message(cause); } }}>Weekly board</button>
			<nav class="dc-nav-group" aria-label="Date navigation">
				<button aria-label="Previous day" disabled={loading || saving || dirty} onclick={() => loadDate(shiftDate(date, -1))}>‹</button>
				<button disabled={loading || saving || dirty} onclick={() => loadDate(dateKey())}>Today</button>
				<button aria-label="Next day" disabled={loading || saving || dirty} onclick={() => loadDate(shiftDate(date, 1))}>›</button>
			</nav>
			<button disabled={loading || dirty || saving || !plan} onclick={openNote}>Open note</button>
			<button class="mod-cta" disabled={loading || !plan} onclick={() => addBlock()}>+ Add entry</button>
		</div>
	</header>
	<div class="dc-summary">
		<span>{completed} of {total} done · {plan?.blocks.length ?? 0} scheduled · {plan?.backlog.length ?? 0} unscheduled</span>
		<span role="status">{loading ? 'Loading…' : saving ? 'Saving…' : dirty ? 'Unsaved changes' : refreshing ? 'Syncing…' : 'Synced with Markdown'}</span>
	</div>
	{#if error}<div class="dc-error" role="alert"><span>{error}</span><button onclick={() => dirty ? flush() : loadDate()}>Retry</button></div>{/if}
	{#if validation}<div class="dc-hint" role="alert">{validation}<button aria-label="Dismiss message" onclick={() => validation = ''}>×</button></div>{/if}
	{#if plan}
		<fieldset class="dc-workspace" disabled={loading}>
			<legend class="dc-sr-only">Plan for {displayDate}</legend>
			<div class="dc-layout">
				<section class="dc-grid-col" aria-label="Daily schedule">
					<div class="dc-panel-heading"><span>Schedule</span><span>{timeString(start)} — {timeString(end)}</span></div>
					<div class="dc-time-grid" role="group" aria-label="Time grid" style:height="{(end - start) * scale}px" ondragover={dragOver} ondrop={drop} ondragleave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dropMinute = null; }}>
						{#each hours as hour}
							<div class="dc-hour-row" style:top="{(hour * 60 - start) * scale}px" style:height="{60 * scale}px">
								<span class="dc-hour-label">{timeString(hour * 60)}</span>
								<div class="dc-hour-slots">
									{#each [0, 15, 30, 45] as offset}
										{@const minute = hour * 60 + offset}
										<button class="dc-slot" aria-label="Add an entry at {timeString(minute)}" title="Add at {timeString(minute)}" onclick={() => addBlock(minute)}><span>+ {timeString(minute)}</span></button>
									{/each}
								</div>
							</div>
						{/each}
						{#each positioned as item (item.block.id)}
							{@const block = item.block}
							<div class="dc-block-card color-{block.color}" class:completed={block.completed} class:dc-selected={selectedId === block.id} class:dc-point={!block.endTime} class:dc-compact={item.height < 70} role="group" aria-label="{block.title}, {block.startTime}{block.endTime ? ` to ${block.endTime}` : ', no duration'}" style:top="{item.top}px" style:height="{item.height}px" style:left="calc(64px + (100% - 64px) * {item.column / item.columns})" style:width="calc((100% - 64px) / {item.columns} - 5px)">
								<div class="dc-card-main">
									<input type="checkbox" aria-label="Complete {block.title}" checked={block.completed} onchange={event => { block.completed = event.currentTarget.checked; commit(); }} />
									{#if !block.endTime}<span class="dc-point-time">{block.startTime}</span>{/if}
									<button class="dc-card-title" title="Edit {block.title}" onclick={() => { selectedId = block.id; validation = ''; }}>{block.title}</button>
									<button class="dc-drag-handle" draggable="true" aria-label="Move {block.title}" title="Drag to move; edit times in details" ondragstart={event => startDrag(event, block.id)} ondragend={() => { draggedId = null; dropMinute = null; }} onclick={() => selectedId = block.id}>⠿</button>
								</div>
								{#if item.height >= 70}
									<div class="dc-block-times"><input aria-label="Start time for {block.title}" class="dc-time-input" value={block.startTime} onchange={event => changeTime(block, 'startTime', event.currentTarget)} maxlength="5" inputmode="numeric" /><span>–</span><input aria-label="End time for {block.title}" class="dc-time-input" value={block.endTime} onchange={event => changeTime(block, 'endTime', event.currentTarget)} maxlength="5" inputmode="numeric" />{#if block.routineId}<span class="dc-routine-label">Routine</span>{/if}</div>
								{/if}
							</div>
						{/each}
						{#if dropMinute !== null}<div class="dc-drop-line" style:top="{(dropMinute - start) * scale}px" aria-hidden="true"><span>{timeString(dropMinute)}</span></div>{/if}
						{#if date === dateKey(now) && nowMinute >= start && nowMinute < end}<div class="dc-now-line" style:top="{(nowMinute - start) * scale}px" aria-label="Current time {timeString(nowMinute)}"><span></span></div>{/if}
					</div>
					{#if outsideHours.length}<div class="dc-outside"><p>Outside visible hours</p>{#each outsideHours as block (block.id)}<button onclick={() => selectedId = block.id}>{block.startTime}{block.endTime ? `–${block.endTime}` : ''} · {block.title}</button>{/each}</div>{/if}
				</section>
				<aside class="dc-sidebar">
					{#if selected}
						<section class="dc-editor" aria-label="Block details">
							<div class="dc-panel-heading"><h3>Block details</h3><button aria-label="Close block details" onclick={() => selectedId = null}>×</button></div>
							<label>Title<input value={selected.title} oninput={event => { selected.title = event.currentTarget.value; commit(); }} /></label>
							<div class="dc-editor-times"><label>Start<input value={selected.startTime} inputmode="numeric" maxlength="5" onchange={event => changeTime(selected, 'startTime', event.currentTarget)} /></label><label>End (optional)<input value={selected.endTime ?? ''} placeholder="No end" inputmode="numeric" maxlength="5" onchange={event => changeTime(selected, 'endTime', event.currentTarget)} /></label></div>
							<p class="dc-help">Leave End empty for an entry at one time with no duration.</p>
							{#if !selected.endTime}<div class="dc-editor-actions"><button onclick={() => { selected.endTime = timeString(minutes(selected.startTime) + settings.defaultDuration); commit(); }}>Add duration</button></div>{/if}
							<label>Color<select value={selected.color} onchange={event => { selected.color = event.currentTarget.value as TimeBlock['color']; commit(); }}>{#each COLORS as value}<option value={value}>{value[0].toUpperCase() + value.slice(1)}</option>{/each}</select></label>
							<div class="dc-editor-actions"><button onclick={() => unschedule(selected)}>Move to tasks</button><button class="dc-delete" onclick={() => remove(selected.id)}>Delete block</button></div>
						</section>
					{/if}
					<section class="dc-backlog-col" aria-label="Unscheduled tasks">
						<div class="dc-panel-heading"><h3>Today's tasks <span class="dc-count">{plan.backlog.length}</span></h3><button onclick={addTask}>+ Task</button></div>
						<p class="dc-help">Drag a task onto the schedule, or use ↗ to find its first free slot.</p>
						<div class="dc-backlog-list">
							{#each plan.backlog as task (task.id)}
								<div class="dc-backlog-item" class:completed={task.completed} role="group" aria-label={task.title}>
									<button class="dc-drag-handle" draggable="true" aria-label="Drag {task.title} to schedule" ondragstart={event => startDrag(event, task.id)} ondragend={() => { draggedId = null; dropMinute = null; }}>⠿</button>
									<input type="checkbox" aria-label="Complete {task.title}" checked={task.completed} onchange={event => { task.completed = event.currentTarget.checked; commit(); }} />
									<input class="dc-backlog-input" aria-label="Task title" value={task.title} oninput={event => { task.title = event.currentTarget.value; commit(); }} />
									<button class="dc-icon-btn" aria-label="Schedule {task.title}" title="Schedule in first free slot" onclick={() => schedule(task)}>↗</button>
									<button class="dc-icon-btn dc-delete" aria-label="Delete {task.title}" onclick={() => remove(task.id)}>×</button>
								</div>
							{:else}<div class="dc-empty"><strong>Room to think.</strong><p>Add the things you want to make time for today.</p><button onclick={addTask}>+ Add a task</button></div>{/each}
						</div>
					</section>
					<p class="dc-storage">{activePath}<br />New weekly routines appear automatically. Your daily changes stay here.</p>
				</aside>
			</div>
		</fieldset>
	{:else if loading}<p role="status">Loading your day…</p>{/if}
</div>
