import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';

const MobileOnlyLayout = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isMobile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-2xl shadow-2xl p-8 text-center border border-line">
          <div className="w-16 h-16 bg-primary-soft text-primary-strong rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="font-heading text-headline font-bold text-ink mb-4">
            Mobile Experience Only
          </h1>
          <p className="text-body text-copy-muted mb-6">
            ColdLink is designed as a mobile-first platform. Please revert to mobile view or resize
            your browser window to continue. Desktop screen isn't available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative max-w-107.5 mx-auto shadow-xl overflow-hidden">
      <Outlet />
    </div>
  );
};

export default MobileOnlyLayout;
