import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Duration from './Duration';

const renderDuration = () => {
  render(
    <MemoryRouter>
      <Duration />
    </MemoryRouter>,
  );
  // The counter buttons have no accessible names yet (#9), so find them next to the "Days" label.
  const counter = screen.getByText('Days').parentElement?.parentElement;
  if (!counter) throw new Error('Days counter not found');
  const [minus, plus] = within(counter).getAllByRole('button');
  if (!minus || !plus) throw new Error('Days counter buttons not found');
  return { minus, plus, user: userEvent.setup() };
};

describe('Duration screen', () => {
  it('starts at 3 days with storage ₦4,500 and total ₦5,400', () => {
    renderDuration();

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('₦4,500')).toBeInTheDocument();
    expect(screen.getByText('₦5,400')).toBeInTheDocument();
  });

  it('adds ₦1,500 to storage and total for each extra day', async () => {
    const { plus, user } = renderDuration();

    await user.click(plus);
    expect(screen.getByText('₦6,000')).toBeInTheDocument();
    expect(screen.getByText('₦6,900')).toBeInTheDocument();

    await user.click(plus);
    expect(screen.getByText('₦7,500')).toBeInTheDocument();
    expect(screen.getByText('₦8,400')).toBeInTheDocument();
  });

  it('disables minus at 1 day', async () => {
    const { minus, user } = renderDuration();

    await user.click(minus);
    expect(minus).toBeEnabled();

    await user.click(minus);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('₦1,500')).toBeInTheDocument();
    expect(screen.getByText('₦2,400')).toBeInTheDocument();
    expect(minus).toBeDisabled();
  });
});
