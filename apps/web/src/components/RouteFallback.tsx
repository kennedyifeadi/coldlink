import React from 'react';

// The message fades in late so fast loads show nothing but the page background.
const RouteFallback = () => (
  <div role="status" className="flex items-center justify-center min-h-screen bg-background">
    <p className="text-copy-subtle text-body opacity-0 animate-fade-in-late">Loading...</p>
  </div>
);

export default RouteFallback;
