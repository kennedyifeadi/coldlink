import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { UserRole } from '@coldlink/shared';
import AppProviders from '../AppProviders';
import { errorResponse, jsonResponse, mockApi, sessionFixture } from '../test/api';
import { RequireSession } from './guards';

const renderAdminRoute = () =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<RequireSession roles={['admin']} />}>
            <Route path="/admin" element={<h1>Admin dashboard</h1>} />
          </Route>
          <Route path="/onboarding" element={<h1>Sign in</h1>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );

const signedInAs = (roles: UserRole[]) =>
  mockApi({ 'POST /auth/refresh': jsonResponse(200, sessionFixture({ roles })) });

describe('RequireSession with roles', () => {
  it('lets in a user with one of the roles', async () => {
    signedInAs(['farmer', 'admin']);
    renderAdminRoute();

    expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument();
  });

  it('shows not found to a signed-in user without the role', async () => {
    signedInAs(['farmer']);
    renderAdminRoute();

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin dashboard' })).not.toBeInTheDocument();
  });

  it('sends a signed-out user to sign in', async () => {
    mockApi({ 'POST /auth/refresh': errorResponse(401, 'unauthorized') });
    renderAdminRoute();

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows the loading state, not the screen, while the session is restored', () => {
    mockApi({ 'POST /auth/refresh': () => new Promise<Response>(() => {}) });
    renderAdminRoute();

    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
