# Metrics: one definition per number

Every stats number in the product now comes from `lib/metrics/`:

| File | What |
| --- | --- |
| `lib/metrics/time.ts` | Eastern-time days/hours (`etDayKey`, `etStartOfDay`, `etHour`, `lastEtDayKeys`, `formatDayKey`). Moved from `lib/wall/aggregate.ts`. |
| `lib/metrics/windows.ts` | Ranges (`7d`/`30d`/`90d`/`all`), fixed windows, and their labels ("Today (ET)", "Last 7 days", "Last 30 days", "All time"). Client-safe. |
| `lib/metrics/definitions.ts` | Pure definitions + `computeHeadlineMetrics` (unit-tested in `definitions.test.ts`). Answer-rate helpers moved here from `lib/insights/aggregate.ts`. |
| `lib/metrics/load.ts` | Server reads (service-role client, `schoolId` or `null` = all schools). Also `findParentUserIds`, shared with the purge cron. |
| `lib/metrics/topics.ts` | Topics & flagged questions for one school (moved from `actions/insights.ts`). |

Consumers:

- **Admin Analytics** `app/s/[slug]/(dashboard)/admin/analytics` via `actions/analytics.ts`
  (`getAnalyticsData`, `exportAnalyticsCSV`). It's the merged Analytics + Insights page;
  `/admin/insights` now permanently redirects to `/admin/analytics#topics` and keeps the query.
- **Admin dashboard strip** `app/s/[slug]/(dashboard)/admin/page.tsx` → `components/admin/stats-cards.tsx`.
- **/wall, /wall.png, /wall.json** `lib/wall/stats.ts`, a thin wrapper: all schools plus the
  collegiate school, both through `loadHeadlineMetrics`.

## Definitions (after)

All days, "today" and hours are **America/New_York**. Schools have no timezone column (the only
`timezone` column is on `blackbaud_calendar_feeds`), so ET applies everywhere. **"Last N days"** means
today (ET) plus the N−1 ET calendar days before it, starting at ET midnight. That way a "Last 7 days"
number is exactly the sum of the last 7 bars of the per-day chart.

| Metric | Definition | Window(s) / label |
| --- | --- | --- |
| Total parents | Distinct users with a `school_memberships` row where `role='parent' AND approved=true` | All time |
| Pending parents | Distinct users with a parent membership where `approved` is not `true` | All time (current) |
| New parents | Approved parents whose **first** approved parent membership was created in the window | Today (ET), Last 7 days |
| Active parents | Distinct askers of `analytics_events` `question` events in the window who have a parent membership (any approval state, the same test the purge cron stamps into `asker_parent`) in that school. Uses scrub-aware keys (`askerKey`). For all schools it's the sum across schools. | Last 7 days (fixed), plus selected range |
| Questions asked | `analytics_events` rows with `event_type='question'` | All time (exact count), Today (ET), Last 7 days, selected range |
| Avg questions / day | Questions in the window ÷ days in the window, 1 decimal | Last 7 days; selected range |
| Answer rate | answered ÷ asked over the window's question events. Uses `metadata.unanswered`, falling back to a same-session/same-text `unanswered_questions` match for legacy events | Last 30 days (fixed), plus selected range |
| Questions per day | Question events per ET day | Selected range ("all" starts at the first question/parent, min 30 days) |
| Questions by hour | Question events in the range by ET hour | Selected range |
| Parent growth | Cumulative approved parents (first approved membership) at the end of each ET day | Selected range |
| Documents | `documents` rows (any status), and those with `status='ready'`. The type chart counts ready documents only | All time |
| Chats with activity | `chat_sessions` with `updated_at` in the range. Chats expire after retention, so long ranges only see chats that still exist | Selected range |
| Topics / couldn't answer | As before (k-anonymous topics, flagged questions only) | Selected range |

## Audit (before)

| Metric | Place | Previous definition |
| --- | --- | --- |
| Parents | Dashboard | `profiles` joined to `school_memberships`, filtered on **`profiles.role='parent'`**. Approval wasn't checked. |
| Pending parents | Dashboard (count + list) | **`profiles.approved=false`** (global profile flag), with `profiles.role='parent'` |
| Total parents | Wall | `school_memberships` `role='parent' AND approved=true`, distinct users |
| User growth | Analytics | **all** `school_memberships` `role='parent'` (pending too). Per **UTC** day, using membership `created_at` |
| Questions today | Dashboard | `analytics_events` question rows since **server-local midnight** (`setHours(0)`, which is UTC on Vercel) |
| Questions today | Wall | Since ET midnight (sparkline's last bucket) |
| Questions total | Dashboard, Wall | Exact count, all time |
| Total questions | Analytics | Question events in the range, but **"All time" meant 365 days** |
| Questions asked | Insights | Question events in the last 7/30/90 × 24h (rolling) |
| Avg / Day | Dashboard | **`questionsTotal / 7`** (all-time total ÷ 7) labelled "Last 7 days" |
| Avg Questions/Day | Analytics | Range total ÷ days in range (365 for "all") |
| Unique Parents | Analytics | Distinct askers (scrub-aware) of **any** role, so admins/staff counted too |
| Active parents | Insights | Distinct askers in the rolling range with **any** parent membership (scrub-aware) |
| Active parents (7d) | Wall | Rolling 7×24h, any parent membership, summed per school |
| Active Sessions | Analytics | `chat_sessions.updated_at` in the range |
| Answer rate | Insights | Rolling range (7/30/90). Unanswered rows matched since range+1 day |
| Answer rate | Wall | Rolling 30 days |
| New parents today / 7d | Wall | Approved memberships created since ET midnight / rolling 7×24h. A parent joining a 2nd school counted as new |
| Questions trend | Analytics | Bucketed by **UTC** day. Chart ticks parsed `"YYYY-MM-DD"` as UTC, so in US browsers they showed the **previous day** |
| Questions by hour | Analytics | `chat_messages` (user role) by **server-local (UTC) hour**. A different table from every other question count, and messages expire after 30 days |
| Top questions | Analytics | `analytics_events.metadata.question` grouped by text, ≥3 distinct `user_id`s. Question text is scrubbed after ~30 minutes, so this was nearly always empty |
| Documents | Dashboard | All documents + ready count (user client) |
| Total Documents | Analytics | **Ready only**, labelled "Total Documents" |
| Members | Super admin | `school_memberships(count)`: every membership (admins + pending), labelled "members". *Unchanged*, see judgment calls |
| Ratings / positive rate | Feedback | `chat_feedback` up/down, all time. *Unchanged*: it's a different metric with its own label |

## Disagreements (before → after)

1. **Avg / Day**: all-time total ÷ 7 labelled "Last 7 days" → questions in the last 7 ET days ÷ 7, labelled "Last 7 days".
2. **Parents**: `profiles.role`/`profiles.approved` on the dashboard vs `school_memberships` approved on the
   wall vs all memberships in growth → approved parent memberships everywhere. Pending = not approved,
   from memberships, and the dashboard's pending **list** now reads the same rows.
3. **"Today"**: server-local/UTC midnight (dashboard) vs ET (wall) → ET everywhere, labelled "Today (ET)".
4. **Per-day buckets**: UTC days (Analytics) vs ET days (wall) → ET days. The chart axis bug (off by one day in US browsers) is fixed with `formatDayKey`.
5. **Rolling vs calendar windows**: rolling 7/30/90×24h (Insights, wall) vs calendar days (charts) → "last N ET calendar days", so the cards equal the chart sums.
6. **"All time"**: 365 days on Analytics → actually all time.
7. **Unique Parents vs Active parents**: any asker (Analytics) vs askers with a parent membership (Insights, wall) → one "Active parents" definition, shown for Last 7 days and the selected range.
8. **Active sessions vs active parents**: `chat_sessions` vs `analytics_events`. They're two different things, so the sessions number is now labelled "Chats with activity" and kept separate.
9. **Answer rate windows**: range (Insights) vs fixed 30 days (wall) → both are shown and labelled: the selected range on the card, "Last 30 days" as its subtitle (the wall shows the 30-day value).
10. **Questions by hour**: `chat_messages` in UTC hours → question events in ET hours, so it adds up to "Questions asked" for the range.
11. **Total Documents**: "ready" was labelled "Total" → "Documents ready: X of Y".
12. **New parents**: a parent joining a second school counted as new → only a user's first approved parent membership counts. Growth uses the same date.
13. **Top questions**: removed. It read question text that's scrubbed after ~30 minutes, and the k-anonymous **Top topics** replaces it.

## Known limits

- Range reads cap at 100,000 question events (a warning is logged). "Questions asked · All time" is always an exact count.
- Parent "joined" dates use membership `created_at`. There's no `approved_at`, so a parent approved late shows up on the day they signed up.
- Across all schools, active parents can count one person once per school (scrubbed events only keep a per-school hash).
