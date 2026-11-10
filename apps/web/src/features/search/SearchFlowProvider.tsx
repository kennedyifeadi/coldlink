import React, { useMemo, useState, type ReactNode } from 'react';
import { SearchFlowContext, type SearchDraft, type SearchFlow } from './searchFlow';

// Above the routes, so the search survives signing in from a result's Book button.
const SearchFlowProvider = ({ children }: { children: ReactNode }) => {
  const [draft, setDraft] = useState<SearchDraft>({});

  const flow = useMemo<SearchFlow>(
    () => ({
      draft,
      update: (changes) => setDraft((current) => ({ ...current, ...changes })),
    }),
    [draft],
  );

  return <SearchFlowContext value={flow}>{children}</SearchFlowContext>;
};

export default SearchFlowProvider;
