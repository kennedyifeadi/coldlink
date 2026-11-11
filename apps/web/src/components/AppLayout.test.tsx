import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { errorResponse, mockApi } from '../test/api';
import { renderApp, SCREEN_TIMEOUT } from '../test/renderApp';

const signedOut = { 'POST /auth/refresh': errorResponse(401, 'unauthorized') };

const findHeading = (name: string) => screen.findByRole('heading', { name }, SCREEN_TIMEOUT);

const openSearchFromHome = async () => {
  mockApi(signedOut);
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const user = renderApp('/');
  await findHeading('Keep your harvest fresh.');
  return { scrollTo, user };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scroll position between screens', () => {
  it('starts a newly opened screen at the top', async () => {
    const { scrollTo, user } = await openSearchFromHome();
    expect(scrollTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Find cold storage/ }));
    await findHeading('Where are you storing from?');

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('leaves back and forward to the browser', async () => {
    const { scrollTo, user } = await openSearchFromHome();
    await user.click(screen.getByRole('button', { name: /^Find cold storage/ }));
    await findHeading('Where are you storing from?');
    scrollTo.mockClear();

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    await findHeading('Keep your harvest fresh.');

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
