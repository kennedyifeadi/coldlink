import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Payment from './Payment';

const renderPayment = () => {
  render(
    <MemoryRouter>
      <Payment />
    </MemoryRouter>,
  );
  return userEvent.setup();
};

describe('Payment screen', () => {
  it('labels every card field', () => {
    renderPayment();

    expect(screen.getByLabelText('Card Number')).toBeInTheDocument();
    expect(screen.getByLabelText('Expiry Date')).toBeInTheDocument();
    expect(screen.getByLabelText('CVV')).toBeInTheDocument();
  });

  it('toggles "Save card" as a checkbox', async () => {
    const user = renderPayment();
    const saveCard = screen.getByRole('checkbox', { name: 'Save card for future payments' });

    expect(saveCard).not.toBeChecked();
    await user.click(screen.getByText('Save card for future payments'));
    expect(saveCard).toBeChecked();
    await user.click(saveCard);
    expect(saveCard).not.toBeChecked();
  });
});
