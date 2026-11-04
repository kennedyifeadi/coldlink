export interface SmsMessage {
  /** E.164 Nigerian number, `+234` and ten digits. */
  to: string;
  text: string;
  /** The template the text came from. Providers log this, never the text, which may hold an OTP. */
  template: string;
}

export interface SmsReceipt {
  providerMessageId: string;
}

export interface SmsProvider {
  /** Resolves once the provider has accepted the message, or rejects with an `SmsSendError`. */
  send(message: SmsMessage): Promise<SmsReceipt>;
}

/**
 * A send the provider did not accept. `retryable` says whether sending the same message again
 * might succeed. The message never holds the SMS text, the phone number or a credential, so it
 * can be stored and logged.
 */
export class SmsSendError extends Error {
  override readonly name = 'SmsSendError';

  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
