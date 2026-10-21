import React, { useState } from 'react';
import { MapPin, Star, Warehouse } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sampleColdRoom as room } from '../../data/mockData';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';
import CardTitle from '../../components/ui/CardTitle';
import QuantityStepper from '../../components/ui/QuantityStepper';
import BottomActionBar from '../../components/ui/BottomActionBar';
import PrimaryButton from '../../components/ui/PrimaryButton';

const Details = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState(2);
  const maxUnits = 10;
  const pricePerUnit = 1500;
  const availablePercentage = (room.availableCapacity / room.totalCapacity) * 100;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-28">
      {/* Top App Bar */}
      <TopNavBar title="Details" showBack={true} />

      <div className="flex flex-col px-4 pt-4 flex-grow overflow-y-auto">
        {/* Hero Card */}
        <div className="relative w-full h-64 rounded-2xl overflow-hidden mb-6 shadow-sm bg-primary-soft">
          <div className="absolute inset-0 flex items-center justify-center pb-16 text-primary-strong">
            <Warehouse size={56} strokeWidth={1.5} />
          </div>

          {/* Hero Content */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
            <div>
              <h1 className="font-heading text-headline font-bold mb-1 leading-tight text-ink">
                {room.name}
              </h1>
              <div className="flex items-center text-copy-muted text-label">
                <MapPin size={14} className="mr-1" /> {room.location}
              </div>
            </div>
            <div className="flex items-center gap-1 bg-surface text-ink px-2.5 py-1 rounded-md text-label font-bold shadow-md shrink-0">
              <Star size={14} className="fill-accent text-accent" /> {room.rating}
            </div>
          </div>
        </div>

        <Card className="p-5 mb-8">
          <CardTitle aside={`${room.availableCapacity} of ${room.totalCapacity} units available`}>
            Storage Capacity
          </CardTitle>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-line-strong rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${availablePercentage}%` }}
            ></div>
          </div>
        </Card>

        {/* How much storage Section */}
        <div className="mb-6">
          <h2 className="font-heading text-title font-bold text-ink mb-1">How much storage?</h2>
          <div className="flex justify-between items-center mb-4">
            <span className="text-copy-muted text-lead">
              ₦{pricePerUnit.toLocaleString()} / unit / day
            </span>
            <span className="text-copy text-label font-medium">Max {maxUnits} units</span>
          </div>
          <QuantityStepper
            value={units}
            onChange={setUnits}
            max={maxUnits}
            label="Units"
            decreaseLabel="Remove a unit"
            increaseLabel="Add a unit"
          />
        </div>
      </div>

      <BottomActionBar>
        <PrimaryButton onClick={() => void navigate('/duration')} withArrow>
          Continue
        </PrimaryButton>
      </BottomActionBar>
    </div>
  );
};

export default Details;
