import React, { lazy, type ComponentType } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import NotFound from './components/NotFound';
import { RedirectIfSignedIn, RequireSession } from './session/guards';
import { MY_BOOKINGS_PATH, SIGN_IN_PATH } from './session/routes';
import { SEARCH_STEPS } from './features/search/searchFlow';

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
const Home = lazyScreen(loadSearch, 'Home');
const Location = lazyScreen(loadSearch, 'Location');
const Produce = lazyScreen(loadSearch, 'Produce');
const Amount = lazyScreen(loadSearch, 'Amount');
const Results = lazyScreen(loadSearch, 'Results');
const Details = lazyScreen(loadBooking, 'Details');
const Duration = lazyScreen(loadBooking, 'Duration');
const Review = lazyScreen(loadBooking, 'Review');
const Payment = lazyScreen(loadBooking, 'Payment');
const Confirmation = lazyScreen(loadBooking, 'Confirmation');
const MyBookings = lazyScreen(loadBooking, 'MyBookings');

// Provider and admin screens (later issues) go under <RequireSession roles={[...]} />.
const AppRoutes = () => (
  <Routes>
    <Route element={<AppLayout />}>
      <Route path="/" element={<Home />} />
      <Route element={<RedirectIfSignedIn />}>
        <Route path={SIGN_IN_PATH} element={<Onboarding />} />
      </Route>
      <Route path="/onboarding/code" element={<OtpEntry />} />
      <Route path="/onboarding/consent" element={<Consent />} />
      <Route path="/privacy" element={<PrivacyNotice />} />
      {/* Anyone can search; signing in waits until Book (PRD 7.3, decision 70). */}
      <Route path={SEARCH_STEPS.place} element={<Location />} />
      <Route path={SEARCH_STEPS.crop} element={<Produce />} />
      <Route path={SEARCH_STEPS.amount} element={<Amount />} />
      <Route path={SEARCH_STEPS.results} element={<Results />} />
      <Route element={<RequireSession />}>
        <Route path="/userid" element={<UserId />} />
        <Route path={MY_BOOKINGS_PATH} element={<MyBookings />} />
        <Route path="/details/:providerId" element={<Details />} />
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
