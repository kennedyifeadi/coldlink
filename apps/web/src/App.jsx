import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MobileOnlyLayout from './components/MobileOnlyLayout';
import Onboarding from './pages/Onboarding';
import Location from './pages/Location';
import UserId from './pages/UserId';
import Produce from './pages/Produce';
import Discovery from './pages/Discovery';
import Details from './pages/Details';
import Duration from './pages/Duration';
import Review from './pages/Review';
import Payment from './pages/Payment';
import Confirmation from './pages/Confirmation';

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
