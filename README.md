# PlanIt

A device-local daily planning app for Walmart team leads. Built for GitHub Pages with no backend, account, runtime dependencies, analytics, or external fonts.

## Use

1. Set up your name, responsible departments, aisle labels, top-stock checkboxes, and associates.
2. Enable and configure your routines. Department labels are editable public reference data, not a live Walmart directory.
3. Start a day with the people working, shifts, meal times, and optional rest breaks.
4. Use the by-the-hour timeline or list to edit estimates, assign work, record progress and actual time, or pin a start time. Dragging a task also pins it; overlapping placements are rejected. On phones, use task details.
5. Conduct a tour and complete it to integrate priorities. A zoning note replaces the automatic assignment for the same aisle. Started, completed, and pinned work stays in place.
6. Complete follow-up before starting the next day. Unfinished tasks carry forward with the remaining estimated duration.

## Scheduling rules

- One person per task, split into segments around meals, rest breaks, or occupied time when necessary. A task with insufficient total capacity remains visibly unscheduled.
- Urgent and high priorities precede normal and low priorities. Time windows and tour priorities are favored within those levels. Assignments balance available workload; explicit assignees and department restrictions are respected.
- Top-stock aisles are spread over the selected work days from Monday through Friday. Completed aisles are counted once in that calendar week. Each day recalculates the remaining target. Friday attempts all outstanding aisles. A Friday finish depends on enough staffing; no impossible assignment is silently claimed complete.
- Zoning fills the configured window with as many whole-aisle estimates as capacity permits. Aisles without a completed zone come first, then the oldest completed zones. Partial zones are not treated as completed.
- RFID scans use a separate weekday calendar for each participating department. Non-RFID departments receive Tuesday deep outs when the scan routine is enabled.
- Reshops create one task per configured window. Other defaults include Pinpoint, bin overstock, feature to home, price changes, digital tag errors, item swaps, and feature discrepancies.
- Repeating tasks have weekday rules, optional assignees, and optional time windows. Modular categories have departments, category numbers, descriptions, section counts, estimates, and optional due dates. Undated or due categories enter new plans when Modulars is enabled.
- Follow-up is mandatory before the next plan; reviewed days are read-only. New plans proceed chronologically. Carryover retains the original window and priority, reduces the estimate according to recorded progress, and avoids duplicating the same aisle, repeating task, or modular category.
- Routine changes apply to future days. **Apply to current day** regenerates pending automatic work while keeping completed, started, pinned, manually created, and tour work.

## Metrics

- Task completion = completed task attempts / assigned task attempts.
- Average zoning completion = mean recorded progress percentage of assigned zoning tasks, including partial work. Carried attempts count separately on each day.
- Actual / estimated time = total actual minutes / total estimated minutes, using only completed tasks with actual time entered. It is descriptive, not a performance standard.
- Aisle coverage uses completed work; estimates alone do not create completion history. Empty metrics show a dash rather than fictional results.
- A clearly labeled sample workspace uses fictional data in memory and never replaces the saved workspace.

## Privacy and storage

Workspace records live in `localStorage` under `planit.workspace.v1`, with the previous valid save in `planit.recovery.v1`. They never go in requests, GitHub commits, the service-worker cache, URLs, or telemetry. The content security policy blocks page connection requests. Public app files are cached for offline use after the first visit. Updates activate when all app tabs close.

Browser storage is local, not encrypted. Someone using the same browser profile can access it. Clearing browser data removes it. Export a private JSON backup from Settings; restoring validates its schema before asking to replace the workspace. If storage is unavailable, the app clearly identifies its temporary workspace. Multiple tabs cannot silently overwrite a newer revision.

GitHub Pages receives ordinary HTTP request metadata. This is not a claim that hosting is anonymous. No Walmart credentials, internal services, or supplier API access are needed.

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
