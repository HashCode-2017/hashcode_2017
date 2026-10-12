# Class sheet page — design

## Goal

The class keeps every group's scores in a public Google Sheet
(`14uP3Iylm2Srmv9AOk9OhVznN6wd00v6XgQnqnTk3riw`, tab `gid=0`). The console only knows the
scores of `.out` files uploaded to it, so most of the class's results are missing. Bring the
sheet into the console as its own read-only dataset, on a page every signed-in user can open,
and let admins refresh it with one button.

The sheet never mixes with console submissions: the leaderboard, statistics and ranked data
sets are untouched.

## Source

The sheet is read from its public CSV export,
`https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=0` — no Google API, no keys.

Layout the parser relies on:

* A block starts at a row whose first cell is `instance \ score groupe`. The next cells are
  `VBS`, then one column per group (`A`…`L`, `P`), then `Lowest Score`, `Borne Inf`.
* The block's title is the first non-empty cell of the nearest row above with text in
  column B (`INSTANCES FOURNIES PAR GOOGLE`, `INSTANCES DE LA PROMO`).
* Instance rows follow until the first row with an empty first cell. Rows whose first cell is
  `TOTAL` or starts with `Classement` are not instances.
* `Classement Hashcode` (in the Google block) is each group's world Hash Code rank.
* Numbers may contain spaces as thousand separators (`2 656 069`, `51 168`). An empty cell is
  "no score", never 0.

If no block header is found, the sync fails and the stored data is kept.

## Storage

One JSON value in the existing `hc_settings` table, key `class_sheet` (works for Supabase and
SQLite; no migration):

```json
{
  "source": "<csv url>",
  "synced_at": 1760000000.0,
  "synced_by": "username",
  "groups": ["A", …, "P"],
  "sections": [
    {"title": "INSTANCES FOURNIES PAR GOOGLE",
     "instances": [{"name": "kittens", "vbs": 1024967, "scores": {"A": 1022556, …}}],
     "world_rank": {"A": 12, …}}
  ],
  "history": [{"at": …, "by": …, "changes": [{"section": …, "instance": …, "group": …,
                                               "old": …, "new": …}]}]
}
```

`history` keeps the last 20 syncs that changed something.

## Module `api/class_sheet.py`

* `fetch(url) -> str` — HTTP GET with httpx, follows redirects, 20 s timeout.
* `parse(text) -> {"groups", "sections"}` — pure.
* `diff(old, new) -> [change]` — per cell: changed values, new instances, new groups,
  removed cells. VBS changes are included with group `VBS`.
* `sync(by) -> {"changed": n, "changes": [...], "synced_at": …}` — fetch, parse, diff with the
  stored snapshot, store only when something changed (or nothing was stored yet).
* `view(snapshot) -> dict` — what the page needs: per section, per group total (sum of known
  scores), number of instances scored, local rank by total (groups with no score unranked),
  gap to the VBS total, and per-instance rank of each group.
* `python -m api.class_sheet` — runs `sync("cli")` and prints each change
  (`D · regional_instance.in: 2,367,395 → 2,372,676`) or `nothing to update`.

## API

* `GET /api/class-sheet` — any signed-in user. Returns `view(snapshot)`, or
  `{"empty": true}` before the first sync.
* `POST /api/admin/class-sheet/sync` — admins only. Returns the sync result; a fetch or
  parse failure is a 502 with the reason.

## Page

Sidebar entry "Class sheet · the class's shared scores", visible to everyone.

* Header: section tabs, "synced <time ago> by <who>", and for admins a **Sync from sheet**
  button. The result shows as a short notice: "Data updated · N cells changed" or
  "Nothing to update" (or the error).
* Standings strip: one card per group with a score — total, local rank, gap to VBS; the
  viewer's group highlighted; in the Google section also the world Hash Code rank.
* Matrix: instances × groups, groups ordered by local rank, groups with no score hidden. Each
  cell is shaded by its gap to VBS (cyan at VBS → amber further behind); the row's best is
  marked. Hover shows score, gap (points and %), and rank on that instance.
* Last changes: collapsible list of the most recent sync's changes.

## Testing

`tests/test_class_sheet.py` with a trimmed copy of today's CSV:
parse finds 2 sections with 4 and 29 instances, known cells, spaced numbers, empty cells
absent; diff on a modified snapshot; view totals and ranks. UI checked by building and
opening the page.
