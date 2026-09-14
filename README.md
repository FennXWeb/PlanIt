# PlanIt

A daily planning app for Walmart team leads with local storage by default and optional Google Drive sync. Built for GitHub Pages with no app backend, build dependencies, analytics, or external fonts. Google sign-in is loaded on demand for optional cloud connections.

## Use

1. Import a PlanIt JSON backup directly from the first-run wizard, connect an existing Google Drive workspace when configured, or set up your name, responsible departments, aisle labels, optional aisle descriptions, top-stock checkboxes, and associates. Descriptions can also be edited in Aisles & departments and appear in aisle task details.
2. Enable and configure your routines. Each has an urgent, high, normal, or low priority, an estimate, and optional **Start no earlier than** / **Required finish by** limits. The library is a single column of compact rows. Drag a handle to save a top-to-bottom scheduling order, or focus it and use Up/Down, Home, or End. The saved order overrides routine priority labels; before reordering, existing priority and deadline settings determine the order. Department labels are editable public reference data, not a live Walmart directory.
3. Start a day with the people working, shifts, meal times, and optional rest breaks.
4. Use the by-the-hour timeline or list to edit estimates, assign work, record progress and actual time, or pin a start time. Click and drag an unstarted task to move it or reassign it to another associate. A preview snaps to five-minute steps and marks invalid placements; release to pin the remaining work as one block. Pending tasks move around the drop, including conflicting pending pins. Meals, started/completed work, department restrictions, and deadlines remain protected. Dragging supports mouse, pen, and touch, with edge scrolling and Escape to cancel. Started/completed work and reviewed days are protected. Right-click a task for editing, starting, completing, unpinning, or deleting; right-click empty timeline space to add a task there. Keyboard users can press Shift+F10 on a focused task and navigate the menu with arrow keys; task details also allow precise placement.
5. Conduct a tour and complete it to integrate priorities. A zoning note replaces the automatic assignment for the same aisle. Started, completed, and pinned work stays in place.
6. Complete follow-up before starting the next day. Unfinished tasks carry forward with the remaining estimated duration.

## Scheduling rules

- One person per task, split into segments around meals, rest breaks, or occupied time when necessary. A task with insufficient total capacity remains visibly unscheduled.
- Urgent and high priorities precede normal and low priorities. Within a priority, the earliest required finish comes first, then tour work and constrained windows. Assignments balance available workload; explicit assignees and department restrictions are respected. The planner list can be sorted by scheduled time, priority, or required finish time; list sorting does not rearrange the schedule.
- Start and finish limits are optional independently. They intersect shift availability, meals, breaks, and any zoning / reshop windows. A **Required finish by** is a hard planning boundary: tasks that cannot fit remain unscheduled with an explanation, rather than being placed late. Higher-priority work can leave lower-priority deadlines without capacity. The planner uses a priority-based allocation heuristic, not a guarantee of a globally optimal schedule.
- Limits use the plan date. Select **Following day** for a time after midnight on an overnight plan; midnight on **Plan day** is the beginning of that date. Manual placement and replanning respect the same limits. Ordinary rebalancing keeps pinned and started work fixed. Editing shifts releases pins and reschedules all unfinished work around the new shifts and breaks, preserving progress and completed records. If a worker is removed, unfinished assignments become eligible for reassignment. Work that cannot fit stays visible for attention.
- Top-stock aisles are spread over the selected work days from Monday through Friday. Completed aisles are counted once in that calendar week. Each day recalculates the remaining target. Friday attempts all outstanding aisles. A Friday finish depends on enough staffing; no impossible assignment is silently claimed complete.
- Zoning fills the configured window with as many whole-aisle estimates as capacity permits. Aisles without a completed zone come first, then the oldest completed zones. Partial zones are not treated as completed. New tour zones inherit zoning time limits and receive at least the routine's scheduling precedence, so automatic aisle fill cannot displace a tour choice. If required limits prevent all automatic zoning, the planner displays a warning.
- RFID scans use a separate weekday calendar for each participating department. Non-RFID departments receive Tuesday deep outs when the scan routine is enabled.
- Reshops create one task per configured window. Other defaults include Pinpoint, bin overstock, feature to home, price changes, digital tag errors, item swaps, and feature discrepancies.
- Repeating tasks have weekday rules, optional assignees, optional time windows, and the same independent start / finish limits. Modular categories have departments, category numbers, descriptions, section counts, estimates, and optional due dates. Undated or due categories enter new plans when Modulars is enabled, using the Modulars routine's priority and daily time limits. RFID and Tuesday deep outs both use the scan routine's priority and limits.
- Follow-up is mandatory before the next plan; reviewed days are read-only. New plans proceed chronologically. Carryover retains the original window, priority, and time limits (relative to the new plan date), reduces the estimate according to recorded progress, and avoids duplicating the same aisle, repeating task, or modular category.
- Routine changes apply to future days. **Apply to current day** regenerates pending automatic work with the new settings while keeping completed, started, pinned, partially completed, carried, manually created, and tour work. Existing task details can override their own limits. In a custom library order, routine precedence follows the saved order; urgent/high custom tasks still precede the routine queue, and normal/low custom work follows it.

## Metrics

- Task completion = completed task attempts / assigned task attempts.
- Average zoning completion = mean recorded progress percentage of assigned zoning tasks, including partial work. Carried attempts count separately on each day.
- Actual / estimated time = total actual minutes / total estimated minutes, using only completed tasks with actual time entered. It is descriptive, not a performance standard.
- Aisle coverage uses completed work; estimates alone do not create completion history. Empty metrics show a dash rather than fictional results.
- A clearly labeled sample workspace uses fictional data in memory and never replaces the saved workspace.

## Privacy and storage

Workspace records live in `localStorage` under `planit.workspace.v1`, with the previous valid save in `planit.recovery.v1`. Local use does not send workspace data to a server. Google Drive sync is optional and sends workspace snapshots directly to the chosen account's private application-data folder. Records never go into GitHub commits, URLs, telemetry, or the service-worker cache. Public app files are cached for offline use after the first visit. Updates activate when all app tabs close.

Cloud connection metadata is separate (`planit.google-sync.v1`) and is not included in workspace exports. Access tokens stay in memory and are never persisted or exported. Conflict resolution keeps a local recovery copy under `planit.before-cloud-restore.v1`; Settings can export it. Importing a backup disconnects Drive so it cannot silently replace cloud work.

Older v1 workspaces and backups receive empty aisle descriptions and optional limits, plus the previous default routine priorities. Names, saved task history, and existing plans are preserved during migration.

Browser storage is local, not encrypted. Someone using the same browser profile can access it. Clearing browser data removes it. Export a private JSON backup from Settings; restoring validates its schema before asking to replace the workspace. If storage is unavailable, the app clearly identifies its temporary workspace. Multiple tabs cannot silently overwrite a newer revision.

GitHub Pages receives ordinary HTTP request metadata. This is not a claim that hosting is anonymous. No Walmart credentials, internal services, or supplier API access are needed. See [Privacy and storage](privacy.html) for the public storage disclosure.

## Optional cloud sync

The Google Drive integration is implemented but requires the site owner's one-time OAuth registration before sign-in is available. See [CLOUD_SETUP.md](CLOUD_SETUP.md). Set the public `GOOGLE_CLIENT_ID` repository variable and rerun the Pages workflow; no client secret is used.

After connection on each device, saved edits sync after five seconds, with checks every 30 seconds while visible and on focus / reconnection. The same Google account is required. Offline work stays local until a successful sync. Expired authorization requires a user-initiated reconnect; the app cannot sync while closed. Initial cloud restoration waits until open forms are closed.

Each upload creates an immutable version. Parallel edits create conflicting heads rather than overwriting a single file. The user chooses a complete workspace to continue with; automatic field-level merging is not attempted. Prior cloud versions remain for recovery and consume Drive storage. Snapshots are capped at 4 MB, and listings stop safely above 10,000 records. Cloud quota or permission errors never discard local work. Token expiry, concurrent edits, failed downloads, account changes, and recovery are covered by mocked provider tests; live two-device OAuth testing remains dependent on the real app registration.

iCloud Drive is supported through manual JSON backup import/export in the device file picker where available. Automatic iCloud sync is not implemented; it would require a separate Apple CloudKit integration.

## Public data and assumptions

Department reference: [SPS Commerce / SupplyPike (July 28, 2020)](https://www.spscommerce.com/community/articles/walmart-departments-and-categories). It is a historical public starter list; stores can customize labels or add missing numbers. Walmart's [supplier taxonomy documentation](https://developer.walmart.com/suppliers/docs/product-type-taxonomy-overview) explains department mapping. Walmart's public [RFID announcement](https://corporate.walmart.com/news/2025/10/22/walmart-and-avery-dennison-collaborate-to-enhance-freshness-and-increase-operational-efficiency-using-rfid) and [digital shelf label overview](https://corporate.walmart.com/about/everyday-affordability/digital-shelf-labels) provide process context.

Tuesday deep outs, Friday top stock, daily Pinpoint, and all routine estimates are requested planning assumptions, not verified universal company policy or labor standards. Meal and rest times are user-configured. PlanIt is independent and not endorsed by Walmart.

## Develop and deploy

Requires Node.js 24 or newer. No dependency installation is needed.

```sh
npm run dev
npm test
npm run build
```

The preview is at `http://127.0.0.1:4173`. The build copies only public app assets to `dist/`. The GitHub Actions workflow tests, builds, and deploys `dist` to Pages on pushes to `main`, the release branch permitted by its Pages environment. Development uses `codex/planit`. Relative URLs support a repository subpath such as `/PlanIt/`. Set the repository Pages source to **GitHub Actions**.

The optional WebMCP navigation tool opens views without returning any private workspace data. It is feature-detected and the app does not require it.

The daily planner includes selectable zoning and top-stock priority lists. Zoning is ordered by oldest completion, with never-completed aisles first; top stock excludes aisles completed during the selected week. Select aisles and use **Add selected to plan**. Existing tasks are marked in the list and never duplicated. Explicitly added priorities stay visible if capacity is insufficient and use the configured aisle estimates, routine limits, and zoning window.
