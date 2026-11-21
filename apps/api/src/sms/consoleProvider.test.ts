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

  it('logs the text too when asked, for local development (decision 111)', async () => {
    const { logger, output } = captureLogs();
    await createConsoleSmsProvider(logger, { showText: true }).send({
      to: '+2348031234567',
      text: 'Accept or reject: http://localhost:5173/a/Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE',
      template: 'booking_received',
    });

    const text = output();
    expect(text).toContain('http://localhost:5173/a/Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE');
    expect(text).not.toContain('8031234567');
  });
});
