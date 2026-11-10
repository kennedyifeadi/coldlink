import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import {
  errorResponse,
  jsonResponse,
  mockApi,
  noContent,
  requestsTo,
  sessionFixture,
} from '../../test/api';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

const signedIn = {
  'POST /auth/refresh': jsonResponse(200, sessionFixture({ coldlinkId: '9616651' })),
};

const stubClipboard = (writeText: (text: string) => Promise<void>) =>
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

describe('ColdLink ID screen', () => {
  it("shows the signed-in user's 7-digit ID", async () => {
    mockApi(signedIn);
    renderApp('/userid');

    expect(await screen.findByText('961 6651', undefined, SCREEN_TIMEOUT)).toBeInTheDocument();
  });

  it('promises no channel that does not exist yet', async () => {
    mockApi(signedIn);
    renderApp('/userid');
    await screen.findByText('961 6651', undefined, SCREEN_TIMEOUT);

    expect(
      screen.getByText('Keep this ID safe. Give it when you contact ColdLink support.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp|USSD/)).not.toBeInTheDocument();
  });

  it('copies the ID without the space and says so', async () => {
    mockApi(signedIn);
    const writeText = vi.fn(() => Promise.resolve());
    const user = renderApp('/userid');
    await screen.findByText('961 6651', undefined, SCREEN_TIMEOUT);
    stubClipboard(writeText);

    await user.click(screen.getByRole('button', { name: 'Copy ID' }));

    expect(writeText).toHaveBeenCalledWith('9616651');
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('asks the user to write the ID down when copying fails', async () => {
    mockApi(signedIn);
    const user = renderApp('/userid');
    await screen.findByText('961 6651', undefined, SCREEN_TIMEOUT);
    stubClipboard(() => Promise.reject(new DOMException('Denied', 'NotAllowedError')));

    await user.click(screen.getByRole('button', { name: 'Copy ID' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      "Couldn't copy the ID. Write it down instead.",
    );
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument();
  });

  it('signs out through the API and returns to the phone screen', async () => {
    const fetchMock = mockApi({ ...signedIn, 'POST /auth/logout': noContent() });
    const user = renderApp('/userid');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }, SCREEN_TIMEOUT));

    expect(
      await screen.findByRole('heading', { name: 'Find cold storage near you.' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/auth/logout')).toHaveLength(1);
  });

  it('stays signed in and explains when sign-out fails', async () => {
    mockApi({ ...signedIn, 'POST /auth/logout': errorResponse(500, 'internal') });
    const user = renderApp('/userid');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }, SCREEN_TIMEOUT));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side. Try again in a moment.',
    );
    expect(screen.getByText('961 6651')).toBeInTheDocument();
  });
});
