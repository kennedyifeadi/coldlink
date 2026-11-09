import React from 'react';
import { useLocation } from 'react-router-dom';

/** Renders the current path, so tests can check where a redirect landed. */
const LocationProbe = () => {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
};

export default LocationProbe;
