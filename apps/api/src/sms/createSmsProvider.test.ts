import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '../test/helpers.js';
import { createSmsProvider } from './createSmsProvider.js';

describe('createSmsProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends nothing with the console provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { logger, output } = captureLogs();
    await createSmsProvider({ provider: 'console' }, logger).send({
      to: '+2348031234567',
      text: 'Hello',
      template: 'otp',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(output()).toContain('SMS not sent');
  });

  it('sends through Termii when configured', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ message_id_str: 'abc' })));
    const provider = createSmsProvider(
      {
        provider: 'termii',
        termii: {
          apiKey: 'k',
          senderId: 'ColdLink',
          baseUrl: 'https://v3.api.termii.com',
          channel: 'dnd',
        },
      },
      captureLogs().logger,
    );
    await expect(
      provider.send({ to: '+2348031234567', text: 'Hello', template: 'otp' }),
    ).resolves.toEqual({ providerMessageId: 'abc' });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
