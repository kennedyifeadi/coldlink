import React, { lazy, type ComponentType } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import NotFound from './components/NotFound';
import { RedirectIfSignedIn, RequireSession } from './session/guards';
import { SIGN_IN_PATH } from './session/routes';

// One chunk per feature: every screen of a feature loads with the first one visited.
const lazyScreen = <Module extends Record<Name, ComponentType>, Name extends keyof Module>(
  load: () => Promise<Module>,
  name: Name,
) => lazy(() => load().then((module) => ({ default: module[name] })));

const loadAuth = () => import('./features/auth');
const loadSearch = () => import('./features/search');
const loadBooking = () => import('./features/booking');

const Onboarding = lazyScreen(loadAuth, 'Onboarding');
const OtpEntry = lazyScreen(loadAuth, 'OtpEntry');
const Consent = lazyScreen(loadAuth, 'Consent');
const PrivacyNotice = lazyScreen(loadAuth, 'PrivacyNotice');
const UserId = lazyScreen(loadAuth, 'UserId');
const Location = lazyScreen(loadSearch, 'Location');
const Produce = lazyScreen(loadSearch, 'Produce');
const Discovery = lazyScreen(loadSearch, 'Discovery');
const Details = lazyScreen(loadBooking, 'Details');
const Duration = lazyScreen(loadBooking, 'Duration');
const Review = lazyScreen(loadBooking, 'Review');
const Payment = lazyScreen(loadBooking, 'Payment');
const Confirmation = lazyScreen(loadBooking, 'Confirmation');

// Provider and admin screens (later issues) go under <RequireSession roles={[...]} />.
const AppRoutes = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route path="/" element={<Navigate to={SIGN_IN_PATH} replace />} />
      <Route element={<RedirectIfSignedIn />}>
        <Route path={SIGN_IN_PATH} element={<Onboarding />} />
      </Route>
      <Route path="/onboarding/code" element={<OtpEntry />} />
      <Route path="/onboarding/consent" element={<Consent />} />
      <Route path="/privacy" element={<PrivacyNotice />} />
      <Route element={<RequireSession />}>
        <Route path="/userid" element={<UserId />} />
        <Route path="/location" element={<Location />} />
        <Route path="/produce" element={<Produce />} />
        <Route path="/discovery" element={<Discovery />} />
        <Route path="/details" element={<Details />} />
        <Route path="/duration" element={<Duration />} />
        <Route path="/review" element={<Review />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/confirmation" element={<Confirmation />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>
);

export default AppRoutes;
