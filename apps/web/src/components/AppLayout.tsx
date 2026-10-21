import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import RouteFallback from './RouteFallback';

// Mobile-first, not mobile-only (decision 14): wide screens get the same 430px column.
const AppLayout = () => (
  <div className="min-h-screen bg-background relative max-w-107.5 mx-auto shadow-xl overflow-hidden">
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  </div>
);

export default AppLayout;
