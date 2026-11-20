import { describe, expect, it } from 'vitest';
import { captureLogs, stubDatabase } from '../test/helpers.js';
import type { withJobLock } from './lock.js';
import { runJob, type ScheduledJob } from './runner.js';

const held: typeof withJobLock = () => Promise.resolve({ ran: false });
const free: typeof withJobLock = async (_db, _job, work) => ({ ran: true, result: await work() });

// Each call advances 1.5 ms, so a run takes 2 ms after rounding.
function steppingClock() {
  let now = 0;
  return () => (now += 1.5);
}

function job(run: ScheduledJob['run']): ScheduledJob {
  return { name: 'release_holds', schedule: '* * * * *', run };
}

const entries = (lines: string[]) =>
  lines.map((line) => JSON.parse(line) as Record<string, unknown>);

describe('runJob', () => {
  it('logs the counts and duration of a run at info', async () => {
    const logs = captureLogs();
    const outcome = await runJob(
      stubDatabase(),
      logs.logger,
      job(() => Promise.resolve({ expired: 2 })),
      { clock: steppingClock(), lock: free },
    );

    expect(outcome).toBe('ran');
    expect(entries(logs.lines)).toEqual([
      expect.objectContaining({
        level: 30,
        msg: 'Job ran',
        job: 'release_holds',
        counts: { expired: 2 },
        durationMs: 2,
      }),
    ]);
  });

  it('does nothing while another run holds the lock', async () => {
    const logs = captureLogs();
    let ran = false;
    const outcome = await runJob(
      stubDatabase(),
      logs.logger,
      job(() => {
        ran = true;
        return Promise.resolve({});
      }),
      { lock: held },
    );

    expect(outcome).toBe('skipped');
    expect(ran).toBe(false);
    expect(logs.output()).not.toContain('Job ran');
  });

  it('logs a failed run at error and does not throw', async () => {
    const logs = captureLogs();
    const outcome = await runJob(
      stubDatabase(),
      logs.logger,
      job(() => Promise.reject(new Error('connection reset'))),
      { clock: steppingClock(), lock: free },
    );

    expect(outcome).toBe('failed');
    const [entry, ...rest] = entries(logs.lines);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      level: 50,
      msg: 'Job failed',
      job: 'release_holds',
      durationMs: 2,
      err: { message: 'connection reset' },
    });
  });
});
