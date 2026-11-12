import React from 'react';
import { useLocation } from 'react-router-dom';

/** Renders the current path and query, so tests can check where a redirect landed. */
const LocationProbe = () => {
  const location = useLocation();
  return (
    <>
      <span data-testid="location">{location.pathname}</span>
      <span data-testid="location-search">{location.search}</span>
    </>
  );
};

export default LocationProbe;
