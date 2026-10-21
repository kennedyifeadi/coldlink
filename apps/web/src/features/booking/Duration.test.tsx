import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Duration from './Duration';

const renderDuration = () => {
  render(
    <MemoryRouter>
      <Duration />
    </MemoryRouter>,
  );
  return {
    minus: screen.getByRole('button', { name: 'Remove a day' }),
    plus: screen.getByRole('button', { name: 'Add a day' }),
    user: userEvent.setup(),
  };
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

  it('labels the stepper in the singular at 1 day and the plural at 2', async () => {
    const { minus, user } = renderDuration();

    await user.click(minus);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Days')).toBeInTheDocument();

    await user.click(minus);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Day')).toBeInTheDocument();
  });
});
