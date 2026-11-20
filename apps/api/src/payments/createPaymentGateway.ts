import type { PaystackConfig } from '../config.js';
import { PaymentGatewayError, type PaymentGateway } from './gateway.js';
import { createPaystackGateway } from './paystackGateway.js';

const NOT_CONFIGURED =
  'Payments are not configured: set PAYSTACK_SECRET_KEY and PAYSTACK_PUBLIC_KEY';

// Outside production the API may run without Paystack, as in CI. Payment calls then fail, and no
// webhook is accepted, since none can be verified.
function unconfiguredPaymentGateway(): PaymentGateway {
  const fail = () => Promise.reject(new PaymentGatewayError(NOT_CONFIGURED));
  return {
    initialize: fail,
    verify: fail,
    refund: fail,
    listRefunds: fail,
    isSignedWebhook: () => false,
  };
}

export function createPaymentGateway(config: PaystackConfig | undefined): PaymentGateway {
  return config === undefined ? unconfiguredPaymentGateway() : createPaystackGateway(config);
}
