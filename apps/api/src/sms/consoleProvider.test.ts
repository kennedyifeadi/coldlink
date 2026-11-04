import { describe, expect, it } from 'vitest';
import { captureLogs } from '../test/helpers.js';
import { createConsoleSmsProvider } from './consoleProvider.js';

describe('console SMS provider', () => {
  it('logs the template and a masked number, never the text', async () => {
    const { logger, output } = captureLogs();
    const receipt = await createConsoleSmsProvider(logger).send({
      to: '+2348031234567',
      text: 'Your ColdLink code is 482913.',
      template: 'otp',
    });

    expect(receipt.providerMessageId).toMatch(/^console-/);
    const text = output();
    expect(text).toContain('"template":"otp"');
    expect(text).toContain('"recipient":"[Redacted phone]"');
    expect(text).not.toContain('8031234567');
    expect(text).not.toContain('482913');
  });
});
