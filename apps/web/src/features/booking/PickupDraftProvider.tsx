import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PickupDraftContext, type PickupDraft, type PickupDraftFlow } from './pickupDraft';

// Above the routes, so a pickup filled in at review survives signing in before payment.
const PickupDraftProvider = ({ children }: { children: ReactNode }) => {
  const [draft, setDraft] = useState<PickupDraft>();
  const clear = useCallback(() => setDraft(undefined), []);

  const flow = useMemo<PickupDraftFlow>(() => ({ draft, save: setDraft, clear }), [draft, clear]);

  return <PickupDraftContext value={flow}>{children}</PickupDraftContext>;
};

export default PickupDraftProvider;
