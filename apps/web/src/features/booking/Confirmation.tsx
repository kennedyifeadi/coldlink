import React from 'react';
import { CheckCircle2, Home, MapPin, Leaf, CalendarDays, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoMain from '../../assets/logo_main.webp';
import { sampleColdRoom as room } from '../../data/mockData';

const Confirmation = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-10">
      {/* Top Header - Just Logo Centered */}
      <div className="flex justify-center items-center px-4 py-6">
        <img src={logoMain} alt="ColdLink, storage nearby" width={138} height={32} />
      </div>

      <div className="flex flex-col px-5 pt-2 flex-grow overflow-y-auto">
        {/* Success Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-primary-faint rounded-full flex items-center justify-center text-primary-strong mb-4">
            <CheckCircle2 size={32} strokeWidth={2.5} />
          </div>
          <h1 className="font-heading text-title font-bold text-ink mb-2">Booking confirmed!</h1>
          <p className="text-copy-muted text-body">A confirmation has been sent to your phone.</p>
        </div>

        {/* Booking Code Card */}
        <div className="bg-surface rounded-2xl p-6 mb-4 border border-line shadow-card text-center flex flex-col items-center">
          <h2 className="text-copy-muted text-label font-medium tracking-widest uppercase mb-4">
            Your Booking Code
          </h2>
          <div className="border border-primary-soft text-primary-strong font-bold text-headline tracking-widest py-3 px-8 rounded-xl mb-4 inline-block bg-surface">
            CL-847291
          </div>
          <p className="text-copy-muted text-body">Show this code when you arrive</p>
        </div>

        {/* Booking Details Card */}
        <div className="bg-surface rounded-2xl p-6 mb-4 border border-line shadow-card">
          <h3 className="text-copy-muted text-label font-medium mb-5">Booking Details</h3>

          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <Home size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">Cold Room</p>
                <p className="text-copy-muted text-body">{room.name}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <MapPin size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">Location</p>
                <p className="text-copy-muted text-body">{room.location}</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <Leaf size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">Produce</p>
                <p className="text-copy-muted text-body">Tomatoes (50 Crates)</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <CalendarDays size={18} className="text-primary mt-0.5" />
              <div>
                <p className="text-ink text-label mb-0.5">Duration</p>
                <p className="text-copy-muted text-body">Oct 12 - Oct 15 (3 days)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary Card */}
        <div className="bg-surface rounded-2xl p-6 mb-8 border border-line shadow-card">
          <h3 className="text-copy-muted text-label font-medium mb-5">Payment Summary</h3>

          <div className="flex flex-col gap-3.5 mb-4">
            <div className="flex justify-between items-center text-body">
              <span className="text-copy-muted">Total Cost</span>
              <span className="text-ink font-medium">₦5,400</span>
            </div>
            <div className="flex justify-between items-center text-body">
              <span className="text-primary-strong">Amount Paid</span>
              <span className="text-primary-strong font-medium">- ₦2,700</span>
            </div>
          </div>

          <div className="h-[1px] bg-line mb-4 w-full"></div>

          <div className="flex justify-between items-center mb-1.5">
            <span className="text-copy-muted text-body">Balance Due</span>
            <span className="font-medium text-ink text-body">₦2,700</span>
          </div>
          <div className="text-right">
            <span className="text-copy-subtle text-caption">To be paid on arrival</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 mt-auto">
          <button
            onClick={() => void navigate('/discovery')}
            className="group flex items-center justify-center w-full py-4 rounded-lg bg-primary hover:bg-primary-hover text-ink font-medium text-subtitle transition-colors shadow-md"
          >
            <span>View booking</span>
            <ArrowRight
              size={20}
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
            />
          </button>
          <button
            onClick={() => void navigate('/discovery')}
            className="w-full py-4 bg-surface border border-line-strong text-ink font-medium text-lead hover:bg-surface-muted rounded-lg transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;
