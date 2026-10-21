import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from './AppRoutes';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('app routes', () => {
  it('shows the not-found page for an unknown URL', async () => {
    renderAt('/no-such-page');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('takes the user back to the start from the not-found page', async () => {
    renderAt('/bookings/123');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Go to start' }));

    expect(
      await screen.findByRole('heading', { name: 'Find cold storage near you.' }),
    ).toBeInTheDocument();
  });

  it('still opens known screens', async () => {
    renderAt('/duration');

    expect(
      await screen.findByRole('heading', { name: 'How long do you need storage?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });
});
