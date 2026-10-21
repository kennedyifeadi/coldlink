import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuantityStepper from './QuantityStepper';

const Stepper = ({ initial, min, max }: { initial: number; min?: number; max?: number }) => {
  const [value, setValue] = useState(initial);
  return (
    <QuantityStepper
      value={value}
      onChange={setValue}
      min={min}
      max={max}
      label="Units"
      decreaseLabel="Remove a unit"
      increaseLabel="Add a unit"
    />
  );
};

const renderStepper = (props: { initial: number; min?: number; max?: number }) => {
  render(<Stepper {...props} />);
  return {
    decrease: screen.getByRole('button', { name: 'Remove a unit' }),
    increase: screen.getByRole('button', { name: 'Add a unit' }),
    user: userEvent.setup(),
  };
};

describe('QuantityStepper', () => {
  it('shows the value with its label', () => {
    renderStepper({ initial: 4 });

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Units')).toBeInTheDocument();
  });

  it('steps up and down by one', async () => {
    const { decrease, increase, user } = renderStepper({ initial: 4 });

    await user.click(increase);
    expect(screen.getByText('5')).toBeInTheDocument();

    await user.click(decrease);
    await user.click(decrease);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('stops at the minimum and disables decrease there', async () => {
    const { decrease, user } = renderStepper({ initial: 2 });

    await user.click(decrease);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(decrease).toBeDisabled();

    await user.click(decrease);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('stops at the maximum and disables increase there', async () => {
    const { decrease, increase, user } = renderStepper({ initial: 9, max: 10 });

    await user.click(increase);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(increase).toBeDisabled();
    expect(decrease).toBeEnabled();

    await user.click(increase);
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('respects a custom minimum', () => {
    const { decrease } = renderStepper({ initial: 5, min: 5 });

    expect(decrease).toBeDisabled();
  });

  it('never disables increase without a maximum', async () => {
    const { increase, user } = renderStepper({ initial: 99 });

    await user.click(increase);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(increase).toBeEnabled();
  });
});
