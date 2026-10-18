# Community news

Each file here is one news item, `news/<id>.json`. Merging builds them into
[`news.json`](https://x-salmon.github.io/shellby-packs/news.json), beside
`index.json`, and Shellby fetches it at most once a day. It shows one item at a
time as a dim card on the Us page and in What's new (a contest also shows in
the Painter), never as a notification, and people can dismiss it with ✕ or
turn the feed off in Settings.

News is for maintainers. The Pack check validates every item with the same
rules the app uses, and refuses a bad one rather than dropping it, so a typo
never reaches anyone.

## An item

```json
{
  "id": "contest-2026-11",
  "kind": "contest",
  "title": "November contest: Frozen crabs",
  "body": "Paint a crab who just came in from the cold.",
  "url": "https://github.com/x-salmon/shellby/discussions/123",
  "from": "2026-11-01",
  "until": "2026-11-21",
  "contest": { "month": "2026-11", "theme": "frozen", "kinds": ["skin"] }
}
```

| Field | | |
|---|---|---|
| `id` | required | Lowercase letters, digits and dashes, up to 60. The file name is `<id>.json`. **Unique forever**: Shellby remembers which ids people dismissed, so never reuse one, even after its file is deleted. |
| `kind` | required | `contest`, `winner`, `event`, `featured` or `note`. |
| `title` | required | Up to 60 characters of plain text. |
| `body` | optional | Up to 200 characters of plain text: no HTML, no Markdown, no line breaks. |
| `url` | optional | An `https://` link to `github.com/x-salmon/…`, `getshellby.com` or `x-salmon.github.io`, nothing else. |
| `from`, `until` | required | Dates as `YYYY-MM-DD`, inclusive, in each person's local time. |
| `contest` | contest only | `{ "month": "YYYY-MM", "theme": "…" (up to 40), "kinds": [...] }`. `kinds` lists what an entry may hold: `skin`, `accessory`, `effect`, `voice`, `scene`, `decor`. |
| `pack` | featured or winner only, optional | A pack id in this gallery. A winner's pack must have a `contest` field. Shellby offers **Get it** for it. |

The built feed is newest first, and must stay under 64 KB (Shellby won't read
more), so delete items once they've ended. Deleting is fine; reusing the id
isn't, and the check says so.

In `index.json`, a pack that a `winner` item names gets `"winner": true`, a
contest entry carries its `"contest"` month, and every pack added through a PR
gets `"by"`, the login of the person who opened it.

## The maintainer's month

| Day | What | Where |
|---|---|---|
| ~25th of the month before | Pick next month's theme | |
| 1st | Post the contest in 🎨 Crab contest; add `news/contest-<month>.json` | Discussions; a PR here |
| 1st–21st | Merge entry packs as they pass the Pack check (each gets a `contest-<month>` label) | here |
| 22nd | Close entries (edit the post); the item's `until` has already passed | Discussions |
| End of month | `node scripts/contest-tally.js <month>` in Shellby, pick the winner | Shellby |
| 1st–3rd of next | Announce in Discussions; add `news/winner-<month>.json` with the pack | Discussions; a PR here |
| Next release | `npm run contest:ship -- <pack> <month>` before `release:cut` | Shellby |

A winner item:

```json
{
  "id": "winner-2026-11",
  "kind": "winner",
  "title": "November's winner: Frosty by crabfan",
  "body": "Votes are in. Wear the winning skin now; it ships built in next release.",
  "url": "https://github.com/x-salmon/shellby/discussions/130",
  "from": "2026-12-02",
  "until": "2026-12-20",
  "pack": "skin-frosty"
}
```

If a month gets no entries, the winner item says so kindly (leave out `pack`)
and the theme rolls over.
