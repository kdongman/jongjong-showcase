/**
 * Pure helpers for VIDEO-mode ImageSegmenter scheduling.
 * One shared segmenter must see strictly increasing timestamps.
 */

export function nextMonotonicTimestamp(previous: number, nowMs: number): number {
  if (!Number.isFinite(previous) || previous < 0) return Math.max(0, nowMs);
  return Math.max(nowMs, previous + 1);
}

export type SerializedJob<T> = () => Promise<T>;

export type FairFrameSchedulerOptions = {
  /** Optional clock for tests. */
  now?: () => number;
  /**
   * Prefer a pending source whose last completed turn is older than this many ms
   * over round-robin alone. Prevents a hot local stream from starving remote.
   */
  starveAfterMs?: number;
};

/**
 * Coalesces frame notifications for a fixed set of sources and executes one
 * latest-frame job at a time. A source can be pending at most once, so a 60fps
 * local stream cannot build an unbounded queue ahead of a 30fps remote stream.
 *
 * Selection is round-robin with anti-starvation: a pending source that has not
 * been served for `starveAfterMs` wins over the next round-robin pick.
 */
export function createFairFrameScheduler<Source extends string>(
  sources: readonly Source[],
  options: FairFrameSchedulerOptions = {},
) {
  const pending = new Set<Source>();
  const lastServedAt = new Map<Source, number>();
  const pendingSince = new Map<Source, number>();
  let running = false;
  let disposed = false;
  let nextIndex = 0;
  let runFrame: ((source: Source) => Promise<void>) | null = null;
  const now = options.now ?? (() => performance.now());
  const starveAfterMs = options.starveAfterMs ?? 120;

  for (const source of sources) lastServedAt.set(source, 0);

  const chooseNext = (): Source | null => {
    if (pending.size === 0) return null;
    const t = now();

    // Anti-starvation: longest-waiting overdue source first.
    let starved: Source | null = null;
    let starvedAge = -1;
    for (const source of sources) {
      if (!pending.has(source)) continue;
      const servedAt = lastServedAt.get(source) ?? 0;
      const age = t - servedAt;
      if (age >= starveAfterMs && age > starvedAge) {
        starved = source;
        starvedAge = age;
      }
    }
    if (starved) {
      pending.delete(starved);
      pendingSince.delete(starved);
      const index = sources.indexOf(starved);
      if (index >= 0) nextIndex = (index + 1) % sources.length;
      return starved;
    }

    for (let offset = 0; offset < sources.length; offset += 1) {
      const index = (nextIndex + offset) % sources.length;
      const source = sources[index]!;
      if (!pending.has(source)) continue;
      pending.delete(source);
      pendingSince.delete(source);
      nextIndex = (index + 1) % sources.length;
      return source;
    }
    return null;
  };

  const drain = async () => {
    if (running || disposed || !runFrame) return;
    running = true;
    try {
      for (let source = chooseNext(); source && !disposed; source = chooseNext()) {
        try {
          await runFrame(source);
        } catch {
          // A failed frame must not starve the other source or stop future frames.
        } finally {
          lastServedAt.set(source, now());
        }
      }
    } finally {
      running = false;
      if (pending.size > 0 && !disposed) void drain();
    }
  };

  return {
    start(handler: (source: Source) => Promise<void>): void {
      runFrame = handler;
    },
    request(source: Source): void {
      if (disposed || !runFrame) return;
      if (!pending.has(source)) pendingSince.set(source, now());
      pending.add(source);
      void drain();
    },
    clearSource(source: Source): void {
      pending.delete(source);
      pendingSince.delete(source);
    },
    dispose(): void {
      disposed = true;
      pending.clear();
      pendingSince.clear();
      runFrame = null;
    },
    get pendingSources(): readonly Source[] {
      return sources.filter((source) => pending.has(source));
    },
    get isRunning(): boolean {
      return running;
    },
    /** Test seam — ms since source was last served (Infinity if never). */
    msSinceServed(source: Source): number {
      const servedAt = lastServedAt.get(source);
      if (servedAt == null || servedAt <= 0) return Number.POSITIVE_INFINITY;
      return now() - servedAt;
    },
  };
}

/** Chain async jobs so at most one runs at a time; failures never break the queue. */
export function createSerializedScheduler(options: { now?: () => number } = {}) {
  let chain: Promise<unknown> = Promise.resolve();
  let inFlight = false;
  let queued = 0;
  let busyStartedAtMs = 0;
  const now = options.now ?? (() => performance.now());

  return {
    get inFlight() {
      return inFlight;
    },
    /** True while a job is running or already scheduled (prevents backlog). */
    get busy() {
      return inFlight || queued > 0;
    },
    /** Ms since the current busy stretch began; 0 when idle. */
    get busyAgeMs() {
      if (!inFlight && queued === 0) return 0;
      if (busyStartedAtMs <= 0) return 0;
      return Math.max(0, now() - busyStartedAtMs);
    },
    run<T>(job: SerializedJob<T>): Promise<T> {
      if (!inFlight && queued === 0) busyStartedAtMs = now();
      queued += 1;
      const execute = async () => {
        queued = Math.max(0, queued - 1);
        inFlight = true;
        try {
          return await job();
        } finally {
          inFlight = false;
          if (queued === 0) busyStartedAtMs = 0;
        }
      };
      const result = chain.then(execute, execute);
      chain = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    /** Schedule only when idle; returns null when a job is already in-flight or queued. */
    tryRun<T>(job: SerializedJob<T>): Promise<T> | null {
      if (inFlight || queued > 0) return null;
      return this.run(job);
    },
  };
}
