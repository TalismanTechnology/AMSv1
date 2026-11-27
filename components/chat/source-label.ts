// Source location labels ("p. 14", "Slide 5", an event's date…) are built in
// English on the server and stored with each answer's sources. For a Spanish
// UI they are re-rendered here, so chips, citation tooltips, the source panel
// and shared answers all read in Spanish. English is returned untouched.
import type { Locale } from "@/lib/i18n/locale";
import type { ChatSource } from "@/lib/types";

const ES_DATE = new Intl.DateTimeFormat("es-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const ES_SHORT_DATE = new Intl.DateTimeFormat("es-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const ES_TIME = new Intl.DateTimeFormat("es-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

function esDay(date: string, format: Intl.DateTimeFormat): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? date : format.format(ms);
}

function esTime(time: string): string {
  const [h, m = "00"] = time.split(":");
  const hour = Number.parseInt(h, 10);
  const minute = Number.parseInt(m, 10);
  if (Number.isNaN(hour)) return time;
  return ES_TIME.format(Date.UTC(2000, 0, 1, hour, Number.isNaN(minute) ? 0 : minute));
}

/** lib/ai/citations.ts formatEventWhen, in Spanish. */
function esEventWhen(event: NonNullable<ChatSource["event"]>): string {
  const isRange = !!event.date_end && event.date_end !== event.date;
  const day = isRange
    ? `${esDay(event.date, ES_SHORT_DATE)} – ${esDay(event.date_end!, ES_SHORT_DATE)}`
    : esDay(event.date, ES_DATE);
  if (!event.start_time) return day;
  const time = event.end_time
    ? `${esTime(event.start_time)} – ${esTime(event.end_time)}`
    : esTime(event.start_time);
  return `${day} · ${time}`;
}

/** lib/ai/rag.ts formatChunkLocation's English words, in Spanish. */
function esStructuralLabel(label: string): string {
  // An email attachment's label leads with its file name: "letter.pdf · p. 2".
  const sep = label.lastIndexOf(" · ");
  const head = sep >= 0 ? label.slice(0, sep + 3) : "";
  const tail = sep >= 0 ? label.slice(sep + 3) : label;
  const translated = tail
    .replace(/^p\. (\d+)–(\d+)$/, "págs. $1–$2")
    .replace(/^p\. (\d+)$/, "pág. $1")
    .replace(/^Slide (\d+)$/, "Diapositiva $1")
    .replace(/^Sheet: /, "Hoja: ")
    .replace(/^Email: /, "Correo: ");
  return head + translated;
}

export function localizeSourceLabel(source: ChatSource, locale: Locale): string | undefined {
  const label = source.location?.label;
  if (locale === "en" || !label) return label;
  if (source.source_type === "event" && source.event?.date) return esEventWhen(source.event);
  return esStructuralLabel(label);
}

/** The sources with their location labels in `locale` (the same array for English). */
export function localizeSources(
  sources: ChatSource[] | undefined,
  locale: Locale
): ChatSource[] | undefined {
  if (locale === "en" || !sources) return sources;
  return sources.map((s) =>
    s.location?.label ? { ...s, location: { ...s.location, label: localizeSourceLabel(s, locale)! } } : s
  );
}
