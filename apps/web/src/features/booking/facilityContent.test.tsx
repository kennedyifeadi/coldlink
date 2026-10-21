import React, { type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { sampleColdRoom } from '../../data/mockData';
import Details from './Details';
import Review from './Review';
import Confirmation from './Confirmation';

const renderScreen = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('facility shown after Discovery', () => {
  it.each([
    ['Details', Details],
    ['Review', Review],
    ['Confirmation', Confirmation],
  ])('%s shows the sample cold room', (_name, Screen) => {
    renderScreen(<Screen />);

    expect(
      screen.getByText(i18n.t(`mock.coldRooms.${sampleColdRoom.id}.name`)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n.t(`mock.coldRooms.${sampleColdRoom.id}.location`), { exact: false }),
    ).toBeInTheDocument();
  });

  it('Details shows the room rating and space', () => {
    renderScreen(<Details />);

    expect(screen.getByText(String(sampleColdRoom.rating))).toBeInTheDocument();
    expect(
      screen.getByText(
        `${sampleColdRoom.availableCapacity} of ${sampleColdRoom.totalCapacity} units available`,
      ),
    ).toBeInTheDocument();
  });
});
