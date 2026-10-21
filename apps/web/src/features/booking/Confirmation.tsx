import React from 'react';
import { CheckCircle2, Home, MapPin, Leaf, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logoMain from '../../assets/logo_main.webp';
import { sampleColdRoom as room } from '../../data/mockData';
import Card from '../../components/ui/Card';
import SummaryRow from '../../components/ui/SummaryRow';
import PrimaryButton from '../../components/ui/PrimaryButton';

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

        <Card className="p-6 mb-4 text-center flex flex-col items-center">
          <h2 className="text-copy-muted text-label font-medium tracking-widest uppercase mb-4">
            Your Booking Code
          </h2>
          <div className="border border-primary-soft text-primary-strong font-bold text-headline tracking-widest py-3 px-8 rounded-xl mb-4 inline-block bg-surface">
            CL-847291
          </div>
          <p className="text-copy-muted text-body">Show this code when you arrive</p>
        </Card>

        <Card className="p-6 mb-4">
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
        </Card>

        <Card className="p-6 mb-8">
          <h3 className="text-copy-muted text-label font-medium mb-5">Payment Summary</h3>

          <div className="flex flex-col gap-3.5 mb-4">
            <SummaryRow label="Total Cost" value="₦5,400" />
            <SummaryRow label="Amount Paid" value="- ₦2,700" variant="highlight" />
          </div>

          <div className="h-[1px] bg-line mb-4 w-full"></div>

          <div className="mb-1.5">
            <SummaryRow label="Balance Due" value="₦2,700" />
          </div>
          <div className="text-right">
            <span className="text-copy-subtle text-caption">To be paid on arrival</span>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 mt-auto">
          <PrimaryButton onClick={() => void navigate('/discovery')} withArrow>
            View booking
          </PrimaryButton>
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
