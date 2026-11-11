## Weekly Routine Board 1.1.0

Day Canvas is now part of Weekly Routine Board. Update the existing plugin to get both recurring weekly planning and dated daily schedules.

- Open **Day canvas** from the weekly toolbar or the command palette, and return with **Weekly board**.
- Plan individual dates with time blocks, single-time entries, unscheduled tasks, completion tracking, colors, and drag and drop.
- Import the selected weekday's routines from the board's configured Markdown note automatically, once per date. Daily edits and completion stay independent of the recurring template.
- Sync plans with dedicated `day-canvas/YYYY-MM-DD.md` notes or daily notes, preserving content outside the managed Timeblocks section.
- Reuse existing standalone Day Canvas settings and Markdown plans. Disable the standalone plugin after updating; only Weekly Routine Board is needed going forward.
- Keep the existing plugin ID, weekly cards, commands, and Obsidian compatibility.

Validation: automated scheduling, routine import, Markdown preservation, concurrent-save, and settings tests; TypeScript/Svelte checks; lint; production build. Interactive Obsidian verification was not available in the release environment.
