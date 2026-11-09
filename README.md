# Weekly Routine Board

**Weekly Routine Board** is an Obsidian plugin that provides a dedicated 7-day weekly board to organize and view the regular tasks, chores, and schedule blocks you do each day of the week alongside your normal calendar events.

Instead of cluttering your one-off calendar with recurring things like *"Monday: do laundry"*, *"Sunday: clean apartment"*, or *"Wake up at 07:00 on weekdays"*, keep a clean visual reference of your regular week right inside Obsidian.

## Features

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

## Settings

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

## License

MIT © [Lennart Friebel](https://github.com/Yaloalo)
