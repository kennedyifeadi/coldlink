import React from 'react';
import { MapPin, Info, ArrowRight, Snowflake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sampleColdRoom as room } from '../data/mockData';
import TopNavBar from '../components/TopNavBar';
import BottomNav from '../components/BottomNav';

const Review = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      {/* Top App Bar */}
      <TopNavBar title="Review" showProfile={true} />

      <div className="flex flex-col px-5 pt-6 pb-6 flex-grow overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-heading text-headline-lg font-bold text-ink mb-2 tracking-tight">
            Review your booking
          </h1>
          <p className="text-copy-muted text-lead leading-relaxed">
            Please confirm your storage details before payment.
          </p>
        </div>

        {/* Facility Details Card */}
        <div className="bg-surface-muted rounded-2xl p-5 mb-4 border border-line">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-ink shrink-0">
              <Snowflake size={20} />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-ink text-lead">{room.name}</h2>
              <div className="flex items-center text-copy-subtle text-label mt-0.5">
                <MapPin size={12} className="mr-1" /> {room.location} ({room.distance}km)
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl p-4 border border-line flex flex-col gap-3">
            <div className="flex justify-between items-center text-body">
              <span className="text-copy-muted">Produce</span>
              <span className="font-semibold text-ink">Tomato</span>
            </div>
            <div className="flex justify-between items-center text-body">
              <span className="text-copy-muted">Quantity</span>
              <span className="font-semibold text-ink">2 Crates (100kg)</span>
            </div>
            <div className="flex justify-between items-center text-body">
              <span className="text-copy-muted">Duration</span>
              <span className="font-semibold text-ink">3 Days</span>
            </div>
          </div>
        </div>

        {/* Cost Summary Card */}
        <div className="bg-surface-muted rounded-2xl p-5 mb-4 border border-line">
          <h3 className="font-heading font-semibold text-ink mb-4">Cost Summary</h3>

          <div className="flex flex-col gap-3 mb-4">
            <div className="flex justify-between items-center text-body">
              <span className="text-copy-muted">Storage (3 days)</span>
              <span className="text-copy">₦4,500</span>
            </div>
            <div className="flex justify-between items-center text-body">
              <span className="text-copy-muted">Delivery</span>
              <span className="text-copy">₦600</span>
            </div>
            <div className="flex justify-between items-center text-body">
              <span className="text-copy-muted">Service Fee</span>
              <span className="text-copy">₦300</span>
            </div>
          </div>

          <div className="h-[1px] bg-line-strong mb-4 w-full"></div>

          <div className="flex justify-between items-center">
            <span className="font-bold text-subtitle text-ink">Total</span>
            <span className="font-bold text-subtitle text-primary-strong">₦5,400</span>
          </div>
        </div>

        {/* Split Payment Plan Card */}
        <div className="bg-accent rounded-2xl p-5 mb-8">
          <div className="flex items-start gap-2 mb-4">
            <Info size={18} className="text-accent-ink shrink-0 mt-0.5" />
            <div>
              <h4 className="font-heading font-semibold text-accent-ink mb-1">
                Split Payment Plan
              </h4>
              <p className="text-accent-ink text-body leading-relaxed">
                You'll pay 50% now to secure the space, and the remaining 50% according to the
                storage provider's arrangement.
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center bg-accent-soft rounded-xl p-4">
            <div className="flex flex-col">
              <span className="text-accent-ink text-caption font-medium mb-1">Pay now (50%)</span>
              <span className="font-bold text-title text-accent-ink">₦2,700</span>
            </div>
            <div className="w-[1px] h-10 bg-accent mx-4"></div>
            <div className="flex flex-col">
              <span className="text-accent-ink text-caption font-medium mb-1">Balance</span>
              <span className="font-bold text-title text-accent-ink">₦2,700</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => void navigate('/payment')}
            className="group flex items-center justify-center w-full py-4 rounded-lg bg-primary hover:bg-primary-hover text-ink font-medium text-subtitle transition-colors shadow-md"
          >
            <span>Pay ₦2,700</span>
            <ArrowRight
              size={20}
              className="ml-2 transition-transform duration-300 group-hover:translate-x-1.5"
            />
          </button>
          <button
            onClick={() => void navigate(-1)}
            className="w-full py-3 text-primary-strong font-medium text-lead hover:bg-surface-muted rounded-lg transition-colors"
          >
            Edit booking
          </button>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab="bookings" />
    </div>
  );
};

export default Review;
