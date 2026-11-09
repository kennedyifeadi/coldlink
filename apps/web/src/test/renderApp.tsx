import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppProviders from '../AppProviders';
import AppRoutes from '../AppRoutes';
import LocationProbe from './LocationProbe';

// Lazy screens can take a while when the whole workspace runs its tests in parallel.
export const SCREEN_TIMEOUT = { timeout: 5000 };

/** The whole app at a URL, with the real providers and routes; fetch must be mocked. */
export const renderApp = (
  path: string,
  { advanceTimers }: { advanceTimers?: (ms: number) => unknown } = {},
) => {
  const user = userEvent.setup(advanceTimers ? { advanceTimers } : {});
  render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
  return user;
};
