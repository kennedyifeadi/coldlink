import React, { Suspense, useLayoutEffect } from 'react';
import { NavigationType, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import RouteFallback from './RouteFallback';

// The window keeps its scroll position across client-side navigation, so a new screen would open
// part-way down. Back and forward (POP) are left to the browser's own restoration (decision 81).
const useScrollToTopOnNavigate = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType !== NavigationType.Pop) window.scrollTo(0, 0);
  }, [pathname, navigationType]);
};

// Mobile-first, not mobile-only (decision 14): wide screens get the same 430px column.
const AppLayout = () => {
  useScrollToTopOnNavigate();

  return (
    <div className="min-h-screen bg-background relative max-w-107.5 mx-auto shadow-xl overflow-hidden">
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </div>
  );
};

export default AppLayout;
