# Grade rollover

Children's grades move up by one every school year without anyone editing
them. Migration `043_grade_rollover.sql`; hourly cron
`/api/cron/roll-grades`; TypeScript mirror in `lib/grades.ts`.

## Model

Each child is anchored to a **graduating class**, `children.class_year`: the
calendar year they finish 12th grade. `children.grade` is still the column
every reader uses (chat context, profile, admin users, insights). It now holds
"the grade this class is in this school year", refreshed by the cron.

```
class_year    = school_year_start + 1 + (12 - grade_index)
current index = 12 - (class_year - (school_year_start + 1))
```

`grade_index`: Pre-K = -1, K = 0, `1`–`12` = 1–12. `school_year_start` is the
calendar year the current school year began (2026 for 2026-27). Examples, in
2026-27: 8th grade → class of 2031; K → 2039; Pre-K → 2040; 12th → 2027.
In 2027-28 the class of 2031 is in 9th grade and the class of 2027 has
graduated.

Grades the app doesn't recognise (legacy free text, or a Veracross grade name
`mapVeracrossGrade` couldn't map) get `class_year = NULL` and never move.

## Where the anchor comes from

A trigger, `children_anchor_class_year`, sets `class_year` from `grade` on
every insert and whenever an update **changes** `grade` or `school_id`, and
clears `graduated_at`. So whichever writer last set a grade wins:

- a parent adding or correcting a child (Profile, welcome form);
- Veracross sign-in (`lib/veracross/link.ts`), which refreshes grades of linked
  children from the school's records each time a parent signs in.

Re-sending the same grade (a rename, or a Veracross sign-in with no change)
leaves the anchor alone. Blackbaud does not sync students, so it never writes
grades. `handle_new_user` stopped creating children in migration 007.

The migration anchored every existing child to the school year it was applied
in, without changing any grade.

## Rollover and graduation

Each school picks the date grades move up: **Admin → Settings → General →
School year → "Grades move up on"** (`settings.grade_rollover_month` /
`grade_rollover_day`, default July 1; February 29 isn't offered). The date is
judged in America/New_York.

`roll_children_grades()` runs hourly (at :05) from `/api/cron/roll-grades` (`CRON_SECRET`, service role). For
each anchored child it works out the current grade for their school's
current school year and:

- **Pre-K–12, grade out of date** → updates `grade` (so right after the
  rollover, everyone moves up);
- **past 12th** → sets `graduated_at`, keeps the row and `grade = '12'`. Nothing
  is ever deleted;
- **marked graduated but no longer past 12th** (the date moved later) → clears
  `graduated_at`;
- **younger than Pre-K** (only possible if the date moved) → left alone.

It returns how many rows changed and is idempotent, so running it again or
missing a day is harmless. Run it by hand with
`curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/roll-grades`
or `select public.roll_children_grades();` in the SQL editor.

Graduated children:

- stay on the parent's Profile with a "Graduated" badge and "Class of …"; the
  parent can remove them or set a grade (which re-anchors them);
- show as "Graduated" on Admin → Users and don't match the 12th Grade filter;
- are left out of the assistant's context. Their names are still redacted if
  a parent types one (`splitGraduatedChildren`, `lib/ai/child-privacy.ts`), and
  Insights topic labelling still redacts every child.

Divisions (Lower / Middle / Upper) need no mapping: the assistant picks the
division from the grade label in the prompt, so it follows the grade.

## Changing the date

Change it in Settings. Grades are a function of the date, so moving it across
today changes which school year it is right now: moving it to a date that
hasn't come yet this year moves every grade back by one until that date;
moving it to one that has already passed moves every grade up at the next
hourly run. The settings page warns before you save when that will happen.

## Known limits

- Every school uses America/New_York; schools have no time zone setting.
- A Veracross sign-in in the summer, before the school updates its records,
  can write last year's grade back; it is corrected at the next sign-in after
  the school's records move up.
- Choosing 12th grade again for a graduated child doesn't un-graduate them
  (the grade hasn't changed, so the anchor isn't refreshed).
- `class_year` and `graduated_at` are writable by the parent through the
  children table's existing RLS policy (their own children only); the app
  never writes them directly.
