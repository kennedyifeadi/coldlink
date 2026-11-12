import React, { lazy, type ComponentType } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import NotFound from './components/NotFound';
import { RedirectIfSignedIn, RequireSession } from './session/guards';
import { MY_BOOKINGS_PATH, PROVIDER_ONBOARDING_PATH, SIGN_IN_PATH } from './session/routes';
import { SEARCH_STEPS } from './features/search/searchFlow';
import { BOOKING_STEPS, paymentReturnPath } from './features/booking/bookingIntent';
import { ONBOARDING_STEPS } from './features/provider/onboardingFlow';

// One chunk per feature: every screen of a feature loads with the first one visited.
const lazyScreen = <Module extends Record<Name, ComponentType>, Name extends keyof Module>(
  load: () => Promise<Module>,
  name: Name,
) => lazy(() => load().then((module) => ({ default: module[name] })));

const loadAuth = () => import('./features/auth');
const loadSearch = () => import('./features/search');
const loadBooking = () => import('./features/booking');
const loadProvider = () => import('./features/provider');

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
const Review = lazyScreen(loadBooking, 'Review');
const Payment = lazyScreen(loadBooking, 'Payment');
const Confirmation = lazyScreen(loadBooking, 'Confirmation');
const MyBookings = lazyScreen(loadBooking, 'MyBookings');
const Facilities = lazyScreen(loadProvider, 'Facilities');
const ContactStep = lazyScreen(loadProvider, 'ContactStep');
const LocationStep = lazyScreen(loadProvider, 'LocationStep');
const CapacityStep = lazyScreen(loadProvider, 'CapacityStep');
const ProduceStep = lazyScreen(loadProvider, 'ProduceStep');
const PhotosStep = lazyScreen(loadProvider, 'PhotosStep');
const Outcome = lazyScreen(loadProvider, 'Outcome');

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
      {/* The exact price comes before the phone number (decision 75); paying needs a session. */}
      <Route path={`${BOOKING_STEPS.details}/:providerId`} element={<Details />} />
      <Route path={`${BOOKING_STEPS.review}/:providerId`} element={<Review />} />
      <Route element={<RequireSession returnTo={paymentReturnPath} />}>
        <Route path={`${BOOKING_STEPS.payment}/:providerId`} element={<Payment />} />
      </Route>
      <Route element={<RequireSession />}>
        <Route path="/userid" element={<UserId />} />
        <Route path={MY_BOOKINGS_PATH} element={<MyBookings />} />
        <Route path="/confirmation" element={<Confirmation />} />
        {/* Any signed-in user can list a facility and becomes a provider by it (decision 62). */}
        <Route path={PROVIDER_ONBOARDING_PATH} element={<Facilities />} />
        <Route path={ONBOARDING_STEPS.contact} element={<ContactStep />} />
        <Route path={ONBOARDING_STEPS.location} element={<LocationStep />} />
        <Route path={ONBOARDING_STEPS.capacity} element={<CapacityStep />} />
        <Route path={ONBOARDING_STEPS.produce} element={<ProduceStep />} />
        <Route path={ONBOARDING_STEPS.photos} element={<PhotosStep />} />
        <Route path={ONBOARDING_STEPS.done} element={<Outcome />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes>
);

export default AppRoutes;
