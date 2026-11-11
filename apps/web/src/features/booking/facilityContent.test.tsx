import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { sampleColdRoom } from '../../data/mockData';
import Confirmation from './Confirmation';

describe('facility shown after booking', () => {
  it('Confirmation shows the sample cold room', () => {
    render(
      <MemoryRouter>
        <Confirmation />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(i18n.t(`mock.coldRooms.${sampleColdRoom.id}.name`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t(`mock.coldRooms.${sampleColdRoom.id}.location`), { exact: false }),
    ).toBeInTheDocument();
  });
});
