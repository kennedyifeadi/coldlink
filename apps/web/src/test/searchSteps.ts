import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { SCREEN_TIMEOUT } from './renderApp';

export const pickArea = async (user: UserEvent, area: string) => {
  await user.click(await screen.findByRole('button', { name: 'Pick your area' }, SCREEN_TIMEOUT));
  await user.type(screen.getByLabelText('Search for your area'), area.split(',')[0]!);
  await user.click(screen.getByRole('button', { name: area }));
  await user.click(screen.getByRole('button', { name: /^Continue/ }));
};

export const pickCrop = async (user: UserEvent, crop: string) => {
  await user.click(await screen.findByRole('button', { name: crop }, SCREEN_TIMEOUT));
  await user.click(screen.getByRole('button', { name: /^Continue/ }));
};

export const enterAmount = async (user: UserEvent, quantity: string) => {
  const input = await screen.findByLabelText('Amount', undefined, SCREEN_TIMEOUT);
  await user.clear(input);
  await user.type(input, quantity);
  await user.click(screen.getByRole('button', { name: /^Find cold storage/ }));
};

/** From the location step: Bodija, tomatoes, 10 crates, and the default 7 days from today. */
export const searchFromBodija = async (user: UserEvent) => {
  await pickArea(user, 'Bodija, Ibadan');
  await pickCrop(user, 'Tomatoes');
  await enterAmount(user, '10');
};
