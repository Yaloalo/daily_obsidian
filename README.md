# Weekly Routine Board

**Weekly Routine Board** combines a recurring 7-day routine board with **Day Canvas**, a dated daily planner for time blocks and tasks. Both views live in one Obsidian plugin and share your routine note.

Instead of cluttering your one-off calendar with recurring things like *"Monday: do laundry"*, *"Sunday: clean apartment"*, or *"Wake up at 07:00 on weekdays"*, keep a clean visual reference of your regular week right inside Obsidian.

## Features

- **Integrated Day Canvas**: Open a dated daily schedule from the weekly toolbar or the **Open day canvas** command. Switch back using **Weekly board**. No separate plugin is required.
- **Daily time blocking**: Add single-time entries or ranges, drag tasks onto the schedule, move blocks, edit times, and check off completed work. Overlapping entries sit side by side. Buttons and time fields also work without dragging on mobile.
- **Weekly routines become daily plans**: The selected weekday's timed cards appear on the schedule and untimed cards appear in Today's tasks. Each routine imports once per date. Daily completion, rescheduling, editing, and deletion stay independent of the weekly template; new dates use the current template.
- **Markdown-backed daily plans**: Store plans in `day-canvas/YYYY-MM-DD.md` or your daily notes folder. Only the `## Timeblocks` section is managed; journal text and other sections are preserved. Changes in Markdown refresh the view, and concurrent changes merge when saving.

- **Left ribbon button & commands**: Click the **Open weekly routine board** icon in the left ribbon (or run the command from the Command Palette) to open the weekly board in any pane or sidebar.
- **7-day weekly board**: View Monday through Sunday side-by-side (or switch to a single focused day when docked in a narrow sidebar next to your calendar).
- **Two sections per day**:
  - **Overall in the day (untimed)**: Add cards for tasks that belong to a specific day of the week without being tied to an exact hour (e.g., *Laundry*, *Clean apartment*, *Groceries*).
  - **Timed schedule**: Add cards tied to a specific start time or time range (e.g., *07:00 Wake up*, *18:00 – 19:30 Gym*), automatically sorted chronologically.
- **Multi-day cards**: Assign a card to a single day or multiple days at once using day pills (`Mon`–`Sun`) or quick presets (`Every day`, `Weekdays`, `Weekends`). Editing a multi-day card updates it across all assigned days, and you can remove a card from a single day or delete it entirely.
- **Drag and drop**: Drag cards between days or between the *Overall in the day* and *Timed schedule* sections (hold `Alt` or `Ctrl` while dropping to copy a card to another day).
- **Color accents & categories**: Organize cards visually with 7 theme-aware color accents and optional category tags and notes.

## Usage

1. Click the **Calendar Clock** icon in the left ribbon, or open the Command Palette (`Ctrl/Cmd + P`) and run **Weekly Routine Board: Open weekly board**.
2. Click **Add card** in the top toolbar (or the `+` button in any day column's *Overall in the day* or *Timed schedule* section).
3. Enter a title, choose which days of the week the card applies to, toggle **Tie to a specific time** if it happens at a set hour, pick an optional color accent or category label, and click **Add card**.
4. Click any card on the board to edit its details, or drag it to another column/section.

## Daily planning

1. Open the weekly board and click **Day canvas**, or run **Weekly Routine Board: Open day canvas**.
2. Use **Today**, **Previous day**, and **Next day** to choose a date. Its weekday routines are added automatically.
3. Click **Add entry** or an empty quarter-hour slot. Leave End blank for a single-time entry, or add an end time for a duration. Use **+ Task** for unscheduled work, then drag it to a time or use the schedule button.
4. Edit titles, times, colors, and completion. Changes save automatically. **Open note** opens the underlying Markdown plan.
5. Use **Weekly board** to edit the recurring template. Existing imported daily copies keep their local edits; newly added routines appear on matching dates when opened.

The daily planner uses the same **Routines markdown note** path as the weekly board, including custom paths. Single-time routines stay single-time entries rather than getting an invented duration.

### Moving from standalone Day Canvas

Update Weekly Routine Board, then disable the standalone **Day Canvas** plugin. Open **Day canvas** from Weekly Routine Board. On the first load of this version, the board adopts any saved standalone Day Canvas calendar hours, storage mode, plan folder, daily notes folder, and default duration. Existing Markdown plans keep the same format and locations. The recurring source is always Weekly Routine Board's configured routine note. You can remove the standalone plugin after confirming your plans open correctly.

If you did not use standalone Day Canvas, updating Weekly Routine Board is all you need. The existing `weekly-routine-board` plugin ID and weekly cards are retained.

## Settings

- **Routines markdown note**: Shared weekly template and daily routine source. Click **Apply** after changing the path. Existing routine notes are loaded; unrelated notes are left untouched.
- **Day canvas start/end hour**: Visible schedule hours, including midnight (`24`) as the end hour.
- **Default block duration**: Minutes used when choosing **Add duration**. Single-time entries have no duration until you add one.
- **Day canvas storage**: Choose dedicated plan notes or daily notes named `YYYY-MM-DD.md`.
- **Day canvas folder / Daily notes folder**: Choose the appropriate vault folder and click **Apply**. Existing notes stay in their original folder when the setting changes.

- **Start week on Sunday**: Choose whether the board starts on Monday (default) or Sunday.
- **Use 24-hour time format**: Switch between `14:00` and `2:00 PM` formatting on timed cards.
- **Show weekend columns**: Toggle Saturday and Sunday columns on or off.
- **Highlight current day**: Highlight the column matching today's day of the week.
- **Compact card display**: Hide card notes on the board for a denser overview.

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins** in Obsidian.
2. Click **Browse** and search for **Weekly Routine Board**.
3. Click **Install**, then **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Copy them into your vault's `.obsidian/plugins/weekly-routine-board/` directory.
3. Reload Obsidian and enable **Weekly Routine Board** under **Settings → Community plugins**.

## Development

```sh
npm ci
npm run lint
npm test
npm run build
npm run smoke
```

The build checks TypeScript and Svelte before bundling both views into one `main.js`. Releases contain only `main.js`, `manifest.json`, and `styles.css`. The release workflow validates version metadata and runs lint, tests, and the production build before publishing.

## License

MIT © [Lennart Friebel](https://github.com/Yaloalo)
