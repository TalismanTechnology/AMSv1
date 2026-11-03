// Per-stage latency for one chat turn, logged as a single structured line
// (`[chat-timing] {...}`) so prod runtime logs show where a slow answer spent
// its time. Observes only: nothing here awaits, wraps or reorders the work it
// times. Never pass it user content — ids, counts and timings only.

/** A point in time, or a [start, end] span — ms since the timer was created. */
export type Timing = number | [number, number];

export interface StageTimer {
  /** Ms since the timer was created, rounded. */
  elapsed(): number;
  /** Records a point in time. The first call for a name wins. */
  mark(name: string): void;
  /** Starts a span now; call the returned function when it ends. */
  start(name: string): () => void;
  /**
   * Records a span ending when the promise settles (either way), without
   * touching the promise itself — the caller still awaits the original.
   */
  observe(name: string, promise: PromiseLike<unknown>): void;
  timings(): Record<string, Timing>;
  /** A non-timing fact for the log line (a flag or count — never user content). */
  note(name: string, value: string | number | boolean | null): void;
  /**
   * The log line, once: later calls return null, so a turn that both errors
   * and aborts is still logged exactly once.
   */
  line(fields: Record<string, unknown>): string | null;
}

export function createTimer(now: () => number = () => performance.now()): StageTimer {
  const origin = now();
  const timings: Record<string, Timing> = {};
  const notes: Record<string, string | number | boolean | null> = {};
  let done = false;
  const elapsed = () => Math.round(now() - origin);
  const start = (name: string) => {
    const s = elapsed();
    return () => {
      timings[name] = [s, elapsed()];
    };
  };
  return {
    elapsed,
    mark(name) {
      if (!(name in timings)) timings[name] = elapsed();
    },
    start,
    observe(name, promise) {
      const end = start(name);
      promise.then(
        () => end(),
        () => end()
      );
    },
    timings: () => ({ ...timings }),
    note(name, value) {
      notes[name] = value;
    },
    line(fields) {
      if (done) return null;
      done = true;
      return "[chat-timing] " + JSON.stringify({ ...notes, ...fields, t: { ...timings } });
    },
  };
}
