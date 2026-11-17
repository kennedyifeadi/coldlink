import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

export type PaymentStep = 'book' | 'pay';

/** A failure in one step of paying, so the screen can tell a refused booking from a refused charge. */
export class PaymentStepError extends Error {
  readonly step: PaymentStep;

  constructor(step: PaymentStep, cause: unknown) {
    super(`Payment step "${step}" failed`, { cause });
    this.name = 'PaymentStepError';
    this.step = step;
  }
}

export const runStep = async <T>(step: PaymentStep, task: () => Promise<T>): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    throw new PaymentStepError(step, error);
  }
};

export const isStepError = (error: unknown, step: PaymentStep): error is PaymentStepError =>
  error instanceof PaymentStepError && error.step === step;

/**
 * Runs one attempt at a time. An attempt resolves to Paystack's checkout URL, which the whole page
 * goes to (never an iframe), or to `undefined` to stop on this screen.
 */
export const usePaymentAttempt = <Args>(attempt: (args: Args) => Promise<string | undefined>) => {
  // The button is disabled while an attempt is out; this also stops a second tap that lands before
  // the re-render, so one tap never makes two bookings.
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: attempt,
    onSuccess: (checkoutUrl) => {
      if (checkoutUrl === undefined) busy.current = false;
      else window.location.assign(checkoutUrl);
    },
    onError: () => {
      busy.current = false;
    },
  });
  const { reset } = mutation;

  // Back from Paystack, the browser may restore this page as it was left, still waiting on the
  // redirect; the farmer must be able to tap again.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      busy.current = false;
      reset();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [reset]);

  return {
    start: (args: Args) => {
      if (busy.current) return;
      busy.current = true;
      mutation.mutate(args);
    },
    redirecting: mutation.isPending || (mutation.isSuccess && mutation.data !== undefined),
    error: mutation.error,
    reset,
  };
};
