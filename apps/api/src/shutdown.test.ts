import { describe, expect, it } from 'vitest';
import { createShutdown, type ShutdownDependencies } from './shutdown.js';
import { captureLogs } from './test/helpers.js';

function setup(closeError?: Error) {
  const steps: string[] = [];
  const logs = captureLogs();
  let resolveExit: (code: number) => void = () => undefined;
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  const deps: ShutdownDependencies = {
    server: {
      close(callback) {
        steps.push('server.close');
        setImmediate(() => callback?.(closeError));
        return this as never;
      },
      closeIdleConnections() {
        steps.push('server.closeIdleConnections');
      },
    },
    scheduler: {
      async stop() {
        steps.push('scheduler.stop');
        await new Promise((resolve) => setTimeout(resolve, 10));
        steps.push('scheduler.stopped');
      },
    },
    tasks: {
      drain() {
        steps.push('tasks.drain');
        return Promise.resolve();
      },
    },
    db: {
      destroy() {
        steps.push('db.destroy');
        return Promise.resolve();
      },
    },
    logger: logs.logger,
    exit: (code) => {
      steps.push(`exit ${code}`);
      resolveExit(code);
    },
  };
  return { shutdown: createShutdown(deps), steps, logs, exited };
}

describe('createShutdown', () => {
  it('stops the scheduler and waits for its runs before draining tasks and closing the pool', async () => {
    const { shutdown, steps, exited } = setup();
    shutdown('SIGTERM');

    await expect(exited).resolves.toBe(0);
    expect(steps[0]).toBe('scheduler.stop');
    expect(steps.slice(steps.indexOf('scheduler.stopped'))).toEqual([
      'scheduler.stopped',
      'tasks.drain',
      'db.destroy',
      'exit 0',
    ]);
  });

  it('exits with 1 when the server fails to close', async () => {
    const { shutdown, steps, logs, exited } = setup(new Error('close failed'));
    shutdown('SIGINT');

    await expect(exited).resolves.toBe(1);
    expect(steps).toContain('scheduler.stop');
    expect(steps).not.toContain('db.destroy');
    expect(logs.output()).toContain('Shutdown failed');
  });
});
