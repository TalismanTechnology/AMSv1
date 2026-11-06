# Document conflicts

Finds places where two of a school's documents disagree (a different pickup
time, fee, deadline or contact for the same thing) and lets school admins say
which is right. Admins rule in **Admin > Conflicts**; the assistant then uses
their ruling when answering parents.

Documents and their chunks are never modified, archived or deleted by this
feature. Everything lives in two new tables.

## Install

Apply `supabase/migrations/046_document_conflicts.sql` manually (Supabase SQL
editor or `supabase db push`). It is additive and idempotent.

The code is safe to deploy first. Until 046 is applied:

- chat answers exactly as before (the resolved-conflicts read fails quietly
  and is treated as "none");
- `/api/cron/scan-conflicts` returns `{ ok: true, skipped: "… not installed" }`;
- Admin > Conflicts shows a "needs a database update" notice and the nav has
  no badge;
- `scripts/scan-conflicts.ts` still does a dry run (candidates found in
  memory — see Script); `--write` refuses with a message.

Missing tables/functions are recognised by `isNotInstalledError`
(`lib/supabase/not-installed.ts`: 42P01, 42703, 42883, PGRST202/204/205).

## Data

- `document_conflicts` — one row per judged chunk pair, unique per school on
  `pair_key` (the unordered chunk-id pair) while both chunks exist (a partial
  unique index). Status:
  - `open` — a conflict for an admin to review;
  - `resolved` — `resolution` is `a_correct`, `b_correct` or `custom`
    (`admin_note` required for `custom`, optional otherwise);
  - `dismissed` — an admin said "Not a conflict";
  - `auto_dismissed` — the model said not a conflict (or wasn't confident, or
    its quotes weren't in the text, date to different years or are
    placeholder text, or the verifier disagreed), or the
    two chunks are from different school years and were never judged (the
    reason is in `description`). Stored so the pair is never paid for again.

  Each side records document id, chunk id, chunk index and page (when the
  chunk has one), the model's verbatim quote (`statement_a/b`) and an excerpt
  of the chunk text as judged (`excerpt_a/b`). Document A is the older
  document. The chunk is the one that holds the quote — the matched chunk or
  one of its neighbours (see Judge); a quote across a chunk seam keeps the
  matched chunk and its excerpt is the stitched text, so the admin page
  highlights it from `excerpt_a/b`. When a row moves to a neighbour, an extra
  `auto_dismissed` row ("Judged via adjacent chunk.") marks the matched pair
  so `find_conflict_candidates` doesn't offer it again.

  **Rulings survive re-processing.** A website re-sync or re-upload replaces a
  document's chunks: the chunk ids become NULL (`ON DELETE SET NULL`) and
  `pair_key` with them, but the row, its statements and excerpts stay. The
  admin page shows the stored excerpt when the chunk is gone; chat matches the
  statement in the new chunks (below); scans don't re-raise it (below).
  Deleting a document deletes its rows.
- `conflict_scan_runs` — one row per scan (trigger, start/finish, counts,
  error) for "last scanned" and the cron's incremental window.
- `find_conflict_candidates(school, document_ids, threshold, neighbors,
  limit)` — service role only.

RLS: school admins and super admins can read their school's rows and update
conflicts; scans write with the service role.

## How a scan works (`lib/conflicts/scan.ts`)

1. **Candidates** (SQL): for each chunk of the scanned documents, its 8
   nearest chunks in the same school from the HNSW embedding index (LATERAL
   KNN, never an all-pairs join), kept when cosine similarity ≥ 0.78, from a
   different ready document, and not already in `document_conflicts`.
   Documents go 20 per call.
2. **Filters** (`candidates.ts`, pure): drop website-vs-website pairs (shared
   headers/footers), near-identical text (similarity ≥ 0.98 or the same text
   once case/punctuation are ignored), already-judged pairs — by chunk ids,
   or by statement: a row for the same two documents (any status) whose two
   statements both appear in the candidate's chunks, i.e. the same conflict
   after re-chunking; placeholder chunks (an HTML comment such as
   `<!--placeholder-->`, or under 40 characters once normalized — counted as
   `missing_text`); pairs of two archival periodicals (titles with magazine,
   alumni, annual giving, annual report, yearbook, "journal … issue",
   student newspaper — `archival_pair`); different school years (below); at
   most 3 pairs per document pair (1 when either document is archival);
   then the top N, pairs without an archival document first, by similarity.
3. **Context**: each selected chunk is read with the chunks just before and
   after it in its document (`chunk_index ± 1`), stitched without the
   chunker's ~200-character overlap (`stitchChunkWindow`, `quotes.ts`: a
   seam overlap of ≥ 25 normalized characters is kept once). The deciding
   sentence is often a neighbour: a "Winter Dress Code" email's dates were
   in chunk 0 while chunk 1 (the clothing list) matched the handbook. The
   reviewed-conflict check runs again on the stitched text, so a conflict
   already reviewed via a neighbouring chunk isn't raised twice.
4. **Judge** (`judge.ts`): Gemini Flash (`TEXT_MODEL_ID`, `lib/ai/models.ts`) via `generateObject`, 4 pairs per
   call, 3 calls at a time, up to 3,600 characters of stitched text per
   side. The prompt has each excerpt's document title, source (upload /
   website / email), dates (added / last processed / email sent), divisions,
   page and year clues (below). It tells the model every document is live in
   the help desk, and that a standing handbook / policy / directory / web
   page stating one rule, date window, time, fee, requirement or contact
   while another live document (a newer email, memo, announcement) states a
   different one for the same group **is** a conflict (confidence ≥ 0.85),
   even when the handbook's title carries last year's label. Not conflicts:
   annual letters / schedules from different years, alumni-magazine or
   student-newspaper history, occurrences of a recurring event, periodical
   issues, complementary or partial detail, different divisions or
   audiences (an all-school or Middle + Upper School notice does apply to
   the Middle School), opinion vs fact, placeholders.
5. **Checks**: a conflict survives only if the model says so with
   confidence ≥ 0.8, its two quotes don't date to different years (weekday
   dates or explicit years, below — reason `different_year`), neither quote
   is placeholder/redacted text (contains "redacted", "[", "TBD" or "see the
   school's email" — reason `placeholder`), *and* both quotes appear in
   their own side's stitched text (whitespace, case and quote style aside).
   Everything else is stored `auto_dismissed`.
6. **Verifier** (`verify.ts`): each survivor gets a second Gemini Flash
   call (one pair per call, temperature 0, like the judge) with a balanced
   prompt: it confirms handbook/web-page overrides by a live notice as
   conflicts, and rejects the claim if a checklist item applies — different
   occurrences of a recurring event; different years' letters, periodical
   issues or archival history; opinion vs fact; an omitted qualifier or
   detail; partial lists; placeholders; different divisions / grades /
   teams / audiences; not the same thing. It answers `conflict` or
   `not_conflict` with a reason and confidence. The row is `open` only for
   `conflict` with confidence ≥ 0.75 (`MIN_VERIFIER_CONFIDENCE`); otherwise
   `auto_dismissed` (reason `verifier`) with "Verifier: <reason>" appended
   to `description`.
   A failed judge or verifier call stores nothing, so those pairs are
   retried next scan.

### Different school years (`years.ts`)

Schools reuse last year's letters with new dates, so near-identical chunks
from two years look like conflicts ("Wednesday, September 3: classes begin"
vs "Wednesday, September 9: …"). Before judging, a pair is auto-dismissed
without a model call (skip reason `different_year`) when:

- both titles name years and they differ — school years against school
  years when both have one (`2025-26`, `2025–2026`, `25-26`, `25.26`),
  otherwise any year 2019–2030 (a school year counts as both its calendar
  years, so "2026-27" and "2026" agree); or
- both chunks have dates written with a weekday ("Wednesday, September 3",
  "Wed., Sept. 3", "Monday 9/8", "9/8 (Mon)", …) and those weekdays put the
  two sides in different school years. Each date's possible years are those
  from four years ago to next year in which the weekday fits; years are
  compared as school years starting in July, so a September–June calendar
  is one year. A chunk with no such dates uses the dates in the rest of its
  document's chunks that the scan read (all of them on the in-memory path)
  — except in a standing policy document, below.

**Standing policy documents** — titles with handbook, policy/policies,
manual, guide(lines), code of conduct, dress code, directory, curriculum,
tuition or financial aid (`isStandingPolicyTitle`) — stay live across years
without being renamed (a school's only Middle School handbook may be
"MSHandbook 25.26 (1)"). A pair with one is never auto-dismissed as
different years unless the other side is another edition of the same series
(the title without years, numbers and "(1)": "MSHandbook 25.26 (1)" and
"MSHandbook 26.27" are; "2026-27 Parents Association Handbook" or a
"Winter Dress Code" email are not) — the judge decides. An undated chunk of
one doesn't inherit weekday dates from the document's other pages.

The same check runs on the model's two quotes after judging (weekday dates or
explicit years), as a veto. The prompt also gets each side's years in the
title and text and what its weekday dates imply ("'Wednesday, September 3'
matches 2025"). Scan results count both: `skipped.different_year` (not
judged) and `autoDismissed.different_year` (vetoed); the script lists the
unjudged ones last and the cron reports `differentYear` per school.

### Triggers and caps

| Trigger | Documents | Pairs judged |
| --- | --- | --- |
| Admin "Scan for conflicts" (runs in `after()`, page polls) | all ready documents | 80 |
| Admin "Full rescan" | all ready documents, after deleting the school's `auto_dismissed` rows | 80 |
| Daily cron `/api/cron/scan-conflicts` (09:45 UTC) | ready documents updated since the school's last completed scan (first run: last 48 h) | 20 per school, 240 s total |
| `scripts/scan-conflicts.ts` | all ready documents | `--limit`, default 80 |

Repeated scans work down the backlog: judged pairs are skipped, so each scan
takes the next most-similar unjudged pairs.

**Full rescan** (`scanConflicts(schoolId, { rescanAll: true })`, the
outline button next to "Scan for conflicts"; `--rescan --write` in the
script) deletes only the school's `auto_dismissed` rows before scanning, so
passages dismissed by an older prompt, threshold or year rule are judged
again. `open`, `resolved` and admin-`dismissed` rows are never deleted.
Like any scan it judges up to 80 pairs; repeat to work through the rest.

### Cost

Gemini Flash, ~4 pairs per call with up to 3,600 characters per excerpt
(chunk plus neighbours): roughly 7–10k input tokens per call, so an 80-pair
manual scan is ~20 calls — cents — plus one ~3–5k-token verifier call per
pair the judge keeps open. The daily cron costs nothing for schools with no new documents. No
embeddings are generated (existing chunk embeddings are reused).

## Effect on answers (`lib/conflicts/resolutions.ts`, `lib/ai/chat-turn.ts`)

Only `resolved` conflicts matter, and only when one of their sides is among
the chunks the turn may use. Loaded in one query by retrieved document id,
in parallel with the passage fetch.

A chunk in the turn's context *is* a side when it belongs to that side's
document **and** either has the stored chunk id or its text contains the
side's statement (whitespace, case and quote style aside). So a ruling keeps
working after its documents are re-chunked; if the new text no longer says
the statement, the ruling no longer applies to it.

- `a_correct` / `b_correct`: the losing side's chunks are removed before
  passages are built. If no passage of the winning document contains the
  winning statement, a passage
  `School clarification: <winning quote> (from <title>)` is added, cited as the
  winning document (opens it like any other document source).
- `custom`: both sides' chunks are removed and the admin's answer is added as an
  "Admin clarification" source (`source_type: "clarification"`), shown as
  **School clarification** with no link.
- Any admin note on an `a_correct`/`b_correct` ruling is added the same way.

At most 3 clarifications per turn, deduplicated. They count toward the
3-row source list like any other source, and several notes merge into one
"School clarification" row. The prompt gains one rule only when a
clarification is present. Open, dismissed and auto-dismissed conflicts change
nothing: unresolved conflicts are answered exactly as before.

## Script

```
npx tsx scripts/scan-conflicts.ts <school-id>             # dry run
npx tsx scripts/scan-conflicts.ts <school-id> --limit 10
npx tsx scripts/scan-conflicts.ts <school-id> --json out.json
npx tsx scripts/scan-conflicts.ts <school-id> --write
npx tsx scripts/scan-conflicts.ts <school-id> --rescan          # dry run, re-judging auto-dismissed pairs
npx tsx scripts/scan-conflicts.ts <school-id> --rescan --write  # full rescan, stored
```

`--rescan` without `--write` touches nothing: `find_conflict_candidates`
leaves out every pair already in `document_conflicts`, so it finds
candidates in memory (`forceInMemory`) and skips only pairs/statements of
non-`auto_dismissed` rows (`ignoreAutoDismissed`).

Reads `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`GOOGLE_GENERATIVE_AI_API_KEY` from the environment (`.env.local` if present).
A dry run calls Gemini and prints candidates and judgments but writes nothing
to the database — no conflicts, no judged pairs, no scan run. `--json <path>`
also writes the judgments (similarity, both documents' titles/types/chunks,
`is_conflict`, status, confidence, topic, description, statements, and the
verifier's `{verdict, reason, confidence}` where it ran) to a file; the
printed list shows the verifier's verdict too.

**Before 046 is applied** a dry run still works: with no
`find_conflict_candidates` it reads every chunk of the school's ready
documents (embeddings included, 500 per page) and finds each chunk's 8
nearest chunks in other documents with similarity ≥ 0.78 in memory
(`lib/conflicts/knn.ts`, brute force with progress output — about 100 s for
15k chunks of 768 dims). The same filters and judging follow; already-judged
pairs are skipped only if `document_conflicts` exists. `--write` refuses
until 046 is applied.

## Cron

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/scan-conflicts
```

## Known limits

- After re-processing, a row's `chunk_a_index`/`page` describe the old
  chunks; a "winner" clarification cites that old location.
- A re-chunked conflict whose stored statement no longer appears verbatim in
  any new chunk (the text changed) can be found again as a new `open` row.
- The cron's window starts at the previous completed scan; if a scan hit its
  cap, the leftover pairs of those documents wait for a manual scan.
- The HNSW index is shared by all schools. On pgvector ≥ 0.8 the function
  turns on iterative scans so the school filter doesn't starve the neighbour
  list; on older versions recall for small schools in a large database is
  lower (ef_search is raised to 200).
- Two admins pressing "Scan" at the same instant can start two scans; pairs
  are still stored once.
