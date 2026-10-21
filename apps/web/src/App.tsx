import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MobileOnlyLayout from './components/MobileOnlyLayout';
import Onboarding from './features/auth/Onboarding';
import Location from './features/search/Location';
import UserId from './features/auth/UserId';
import Produce from './features/search/Produce';
import Discovery from './features/search/Discovery';
import Details from './features/booking/Details';
import Duration from './features/booking/Duration';
import Review from './features/booking/Review';
import Payment from './features/booking/Payment';
import Confirmation from './features/booking/Confirmation';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MobileOnlyLayout />}>
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/userid" element={<UserId />} />
          <Route path="/location" element={<Location />} />
          <Route path="/produce" element={<Produce />} />
          <Route path="/discovery" element={<Discovery />} />
          <Route path="/details" element={<Details />} />
          <Route path="/duration" element={<Duration />} />
          <Route path="/review" element={<Review />} />
          <Route path="/payment" element={<Payment />} />
          <Route path="/confirmation" element={<Confirmation />} />
          {/* Add more routes here as we build the app */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
