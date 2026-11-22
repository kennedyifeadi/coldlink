import { describe, expect, it } from 'vitest';
import { createBookingServices } from './services.js';
import { captureLogs, stubDatabase, testConfig } from './test/helpers.js';

describe('createBookingServices', () => {
  it.each([true, false])(
    'shows SMS text in the console only where the dev OTP is allowed (devOtp %s)',
    async (devOtp) => {
      const logs = captureLogs();
      const { notifications } = createBookingServices({
        db: stubDatabase(),
        config: { ...testConfig, auth: { ...testConfig.auth, devOtp } },
        logger: logs.logger,
      });
      await notifications.sms.send({
        to: '+2348031234567',
        text: 'Hello from ColdLink',
        template: 'greeting',
      });

      expect(logs.output().includes('Hello from ColdLink')).toBe(devOtp);
    },
  );
});
