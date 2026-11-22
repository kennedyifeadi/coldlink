import { describe, expect, it } from 'vitest';
import { captureLogs } from '../test/helpers.js';
import type { ScheduledJob } from './runner.js';
import { createScheduler } from './scheduler.js';

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Every second, croner's six-field form, so the test sees a run within one.
const job: ScheduledJob = { name: 'tick', schedule: '* * * * * *', run: () => Promise.resolve({}) };

async function waitFor(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('createScheduler', () => {
  it('runs each job on its schedule and stops starting runs once stopped', async () => {
    const runs: string[] = [];
    const scheduler = createScheduler({
      jobs: [job],
      logger: captureLogs().logger,
      run: (scheduled) => {
        runs.push(scheduled.name);
        return Promise.resolve();
      },
    });
    scheduler.start();
    await waitFor(() => runs.length > 0);
    await scheduler.stop();
    const stoppedAt = runs.length;

    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(runs).toHaveLength(stoppedAt);
  });

  it('lets a run in progress finish before stop resolves', async () => {
    const release = deferred();
    const events: string[] = [];
    const scheduler = createScheduler({
      jobs: [job],
      logger: captureLogs().logger,
      run: async () => {
        events.push('started');
        await release.promise;
        events.push('finished');
      },
    });
    scheduler.start();
    await waitFor(() => events.includes('started'));

    const stopped = scheduler.stop().then(() => events.push('stopped'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toEqual(['started']);
    release.resolve();
    await stopped;
    expect(events).toEqual(['started', 'finished', 'stopped']);
  });

  it('tells a run in progress that it is stopping', async () => {
    let seen: AbortSignal | undefined;
    const release = deferred();
    const scheduler = createScheduler({
      jobs: [job],
      logger: captureLogs().logger,
      run: async (_job, signal) => {
        seen = signal;
        await release.promise;
      },
    });
    scheduler.start();
    await waitFor(() => seen !== undefined);
    expect(seen?.aborted).toBe(false);

    const stopped = scheduler.stop();
    expect(seen?.aborted).toBe(true);
    release.resolve();
    await stopped;
  });

  it('does not overlap a run that outlasts its interval', async () => {
    const release = deferred();
    let runs = 0;
    const scheduler = createScheduler({
      jobs: [job],
      logger: captureLogs().logger,
      run: async () => {
        runs += 1;
        await release.promise;
      },
    });
    scheduler.start();
    await waitFor(() => runs === 1);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(runs).toBe(1);
    release.resolve();
    await scheduler.stop();
  });

  it('can be stopped without having started', async () => {
    const logs = captureLogs();
    await createScheduler({
      jobs: [job],
      logger: logs.logger,
      run: () => Promise.resolve(),
    }).stop();
    expect(logs.output()).toContain('Scheduler stopped');
  });
});
