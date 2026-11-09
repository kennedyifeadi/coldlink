import { useCallback, useEffect, useState } from 'react';

/** Whole seconds left until a deadline, ticking once a second until it reaches 0. */
export const useCountdown = (initialSeconds: number) => {
  const [deadline, setDeadline] = useState(() => Date.now() + initialSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, deadline]);

  const restart = useCallback((seconds: number) => {
    const startedAt = Date.now();
    setNow(startedAt);
    setDeadline(startedAt + seconds * 1000);
  }, []);

  return { remaining, restart };
};
