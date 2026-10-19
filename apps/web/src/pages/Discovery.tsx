import React from 'react';
import { MapPin, SlidersHorizontal, Star, Leaf } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { coldRooms, type ColdRoom } from '../data/mockData';
import TopNavBar from '../components/TopNavBar';
import BottomNav from '../components/BottomNav';

const Discovery = () => {
  const navigate = useNavigate();

  const renderAvailabilityBar = (room: ColdRoom) => {
    const percentage = (room.availableCapacity / room.totalCapacity) * 100;
    const isLow = percentage <= 10;

    return (
      <div className="w-full h-1.5 bg-primary-soft rounded-full mt-2 overflow-hidden flex">
        <div
          className={`h-full rounded-full transition-all ${isLow ? 'bg-alert' : 'bg-primary'}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      {/* Top App Bar */}
      <TopNavBar title="Cold Rooms" showProfile={true} />

      <div className="flex flex-col px-4 pt-6 flex-grow overflow-y-auto">
        {/* Page Title */}
        <h1 className="font-heading text-headline-lg font-bold text-ink mb-4 tracking-tight">
          Cold storage near you
        </h1>

        {/* Filter Pills */}
        <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          <button className="flex items-center gap-1.5 bg-primary-soft text-ink px-3.5 py-1.5 rounded-full font-medium text-label whitespace-nowrap shrink-0">
            <Leaf size={14} /> Tomatoes
          </button>
          <button className="flex items-center gap-1.5 bg-primary-soft text-ink px-3.5 py-1.5 rounded-full font-medium text-label whitespace-nowrap shrink-0">
            <MapPin size={14} /> Ibadan
          </button>
          <button className="flex items-center gap-1.5 bg-primary-soft text-ink px-3.5 py-1.5 rounded-full font-medium text-label whitespace-nowrap shrink-0">
            <SlidersHorizontal size={14} /> Filters
          </button>
        </div>

        {/* Cold Rooms List */}
        <div className="flex flex-col gap-6">
          {coldRooms.map((room) => {
            const isLow = room.availableCapacity / room.totalCapacity <= 0.1;

            return (
              <div
                key={room.id}
                className="bg-surface rounded-2xl overflow-hidden border border-line-strong shadow-card"
              >
                {/* Image */}
                <div className="w-full h-36 bg-surface-sunken overflow-hidden relative">
                  <img src={room.image} alt={room.name} className="w-full h-full object-cover" />
                </div>

                {/* Content */}
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="font-heading text-title font-bold text-ink leading-tight">
                      {room.name}
                    </h2>
                    <div className="flex items-center gap-1 bg-primary-soft text-ink px-2 py-0.5 rounded text-label font-medium shrink-0">
                      <Star size={12} className="fill-current" /> {room.rating}
                    </div>
                  </div>

                  <div className="flex justify-between items-end mb-4">
                    <div className="flex items-center text-copy-muted text-body">
                      <MapPin size={14} className="mr-1 opacity-70" /> {room.distance} km away
                    </div>
                    <div className="text-copy">
                      <span className="font-bold text-subtitle">
                        ₦{room.pricePerDay.toLocaleString()}
                      </span>{' '}
                      <span className="text-copy-subtle text-label">/ day</span>
                    </div>
                  </div>

                  {/* Availability */}
                  <div className="mb-6">
                    <div className="flex justify-between items-end text-label mb-1">
                      <span className="text-copy-muted">Availability</span>
                      <span className={`font-medium ${isLow ? 'text-alert-strong' : 'text-ink'}`}>
                        {isLow
                          ? `Only ${room.availableCapacity} spaces left`
                          : `${room.availableCapacity} of ${room.totalCapacity} spaces`}
                      </span>
                    </div>
                    {renderAvailabilityBar(room)}
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => void navigate('/details')}
                    className="w-full bg-primary hover:bg-primary-hover text-ink font-medium py-3.5 rounded-lg transition-colors"
                  >
                    View storage
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab="find" />
    </div>
  );
};

export default Discovery;
