import { describe, expect, it } from 'vitest';
import { createBackgroundTasks } from './backgroundTasks.js';
import { captureLogs } from './test/helpers.js';

describe('background tasks', () => {
  it('runs a task after the caller has moved on, and drain waits for it', async () => {
    const tasks = createBackgroundTasks();
    const done: string[] = [];
    tasks.run(captureLogs().logger, 'failed', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      done.push('sent');
    });
    expect(done).toEqual([]);
    await tasks.drain();
    expect(done).toEqual(['sent']);
  });

  it('logs a failure at error level instead of losing it', async () => {
    const tasks = createBackgroundTasks();
    const { logger, lines } = captureLogs();
    tasks.run(logger, 'Sending the sign-in code failed', () =>
      Promise.reject(new Error('connection refused')),
    );
    tasks.run(logger, 'Thrown synchronously', () => {
      throw new Error('bad input');
    });
    await tasks.drain();
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 50,
          msg: 'Sending the sign-in code failed',
          err: expect.objectContaining({ message: 'connection refused' }) as unknown,
        }),
        expect.objectContaining({ level: 50, msg: 'Thrown synchronously' }),
      ]),
    );
  });

  it('drains tasks started while draining', async () => {
    const tasks = createBackgroundTasks();
    const { logger } = captureLogs();
    const done: string[] = [];
    tasks.run(logger, 'failed', async () => {
      await Promise.resolve();
      tasks.run(logger, 'failed', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        done.push('second');
      });
    });
    await tasks.drain();
    expect(done).toEqual(['second']);
  });
});
