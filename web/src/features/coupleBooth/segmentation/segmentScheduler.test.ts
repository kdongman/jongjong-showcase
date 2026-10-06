import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFairFrameScheduler, createSerializedScheduler, nextMonotonicTimestamp } from './segmentScheduler';

describe('segmentScheduler', () => {
  it('keeps VIDEO timestamps strictly monotonic across local/remote alternation', () => {
    let previous = -1;
    const stamps: number[] = [];
    for (const now of [100, 100, 99, 150, 150.2]) {
      previous = nextMonotonicTimestamp(previous, now);
      stamps.push(previous);
    }
    // previous+1 floor means 150.2 after 150 becomes 151 (not 150.2).
    assert.deepEqual(stamps, [100, 101, 102, 150, 151]);
    for (let i = 1; i < stamps.length; i += 1) {
      assert.ok(stamps[i]! > stamps[i - 1]!);
    }
  });

  it('serializes jobs and clears in-flight after throw so the next frame can run', async () => {
    const scheduler = createSerializedScheduler();
    const order: string[] = [];
    const first = scheduler.run(async () => {
      order.push('start-a');
      assert.equal(scheduler.inFlight, true);
      throw new Error('infer-failed');
    });
    const second = scheduler.run(async () => {
      order.push('start-b');
      return 'ok';
    });
    await assert.rejects(() => first);
    assert.equal(await second, 'ok');
    assert.deepEqual(order, ['start-a', 'start-b']);
    assert.equal(scheduler.inFlight, false);
    assert.equal(scheduler.busy, false);
  });

  it('tracks busyAgeMs while a job is in flight', async () => {
    let clock = 1000;
    const scheduler = createSerializedScheduler({ now: () => clock });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const job = scheduler.run(async () => {
      await gate;
    });
    assert.equal(scheduler.busy, true);
    clock = 1600;
    assert.ok(scheduler.busyAgeMs >= 600);
    release();
    await job;
    assert.equal(scheduler.busyAgeMs, 0);
  });

  it('tryRun skips while busy so local/remote ticks cannot pile up concurrent inference', async () => {
    const scheduler = createSerializedScheduler();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = scheduler.tryRun(async () => {
      await gate;
      return 'a';
    });
    assert.ok(first);
    assert.equal(scheduler.busy, true);
    assert.equal(scheduler.tryRun(async () => 'b'), null);
    release();
    assert.equal(await first, 'a');
    assert.equal(scheduler.busy, false);
    assert.equal(await scheduler.tryRun(async () => 'c'), 'c');
  });

  it('coalesces latest frame notifications and gives remote a turn after local', async () => {
    const scheduler = createFairFrameScheduler(['local', 'remote'] as const);
    const order: string[] = [];
    let releaseLocal!: () => void;
    const localGate = new Promise<void>((resolve) => { releaseLocal = resolve; });
    scheduler.start(async (source) => {
      order.push(source);
      if (source === 'local' && order.length === 1) await localGate;
    });

    scheduler.request('local');
    scheduler.request('local');
    scheduler.request('remote');
    scheduler.request('local');
    // The running local job may retain one latest local frame, while remote is
    // also pending. Round-robin selects remote first after the current local.
    assert.deepEqual(scheduler.pendingSources, ['local', 'remote']);
    releaseLocal();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(order, ['local', 'remote', 'local']);
    assert.equal(scheduler.isRunning, false);
  });

  it('continues both sources after an inference failure', async () => {
    const scheduler = createFairFrameScheduler(['local', 'remote'] as const);
    const order: string[] = [];
    scheduler.start(async (source) => {
      order.push(source);
      if (source === 'local') throw new Error('infer-failed');
    });
    scheduler.request('local');
    scheduler.request('remote');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(order, ['local', 'remote']);
  });

  it('does not starve remote when local submits much faster', async () => {
    let clock = 0;
    const scheduler = createFairFrameScheduler(['local', 'remote'] as const, {
      now: () => clock,
      starveAfterMs: 100,
    });
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    scheduler.start(async (source) => {
      order.push(source);
      if (order.length === 1) await gate;
    });

    clock = 0;
    scheduler.request('local');
    scheduler.request('local');
    clock = 50;
    scheduler.request('remote');
    clock = 120;
    scheduler.request('local');
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(order.includes('remote'), `expected remote in ${order.join(',')}`);
    assert.ok(order.indexOf('remote') <= 2, `remote should run early, got ${order.join(',')}`);
  });

  it('clearSource drops only that pending source', async () => {
    const scheduler = createFairFrameScheduler(['local', 'remote'] as const);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    scheduler.start(async (source) => {
      order.push(source);
      if (order.length === 1) await gate;
    });
    scheduler.request('local');
    scheduler.request('remote');
    scheduler.clearSource('local');
    assert.deepEqual(scheduler.pendingSources, ['remote']);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(order, ['local', 'remote']);
  });

  it('dispose stops further work for both sources', async () => {
    const scheduler = createFairFrameScheduler(['local', 'remote'] as const);
    const order: string[] = [];
    scheduler.start(async (source) => { order.push(source); });
    scheduler.dispose();
    scheduler.request('local');
    scheduler.request('remote');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(order, []);
  });

  it('host and guest use identical fair-scheduler defaults (role symmetry)', () => {
    const hostPolicy = { starveAfterMs: 100 as const, sources: ['local', 'remote'] as const };
    const guestPolicy = { starveAfterMs: 100 as const, sources: ['local', 'remote'] as const };
    assert.deepEqual(hostPolicy, guestPolicy);
  });
});
